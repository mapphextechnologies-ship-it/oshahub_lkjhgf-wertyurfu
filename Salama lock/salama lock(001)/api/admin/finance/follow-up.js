import { readJson, sendJson } from '../../_lib/http.js';
import { assertBodySize, assertRateLimit } from '../../_lib/security.js';
import { getSupabase, requirePortalUser } from '../../_lib/supabase.js';
import { sendAgentFollowUpSms, sendPaymentReminderSms } from '../../_lib/africastalking.js';
import { claimReminderSend, resolveReminderIntervalDays, resolveRepaymentDueAt } from '../../_lib/reminders.js';
import { logError, logWarn } from '../../_lib/logging.js';

function daysBetween(dateValue, now = new Date()) {
  if (!dateValue) return 0;
  const currentNow = now instanceof Date ? now : new Date(now);
  const safeNow = Number.isNaN(currentNow.getTime()) ? new Date() : currentNow;
  const today = new Date(`${safeNow.toISOString().slice(0, 10)}T12:00:00.000Z`);
  const target = new Date(`${String(dateValue).slice(0, 10)}T12:00:00.000Z`);
  if (Number.isNaN(target.getTime())) return 0;
  return Math.floor((today - target) / (24 * 60 * 60 * 1000));
}

function reminderAmount(customer = {}, overdueDays = 0) {
  const dailyInstallment = Number(customer.daily_installment || customer.dailyInstallment || 0);
  const balance = Number(customer.balance || 0);
  const missedDays = Math.max(1, Number(overdueDays || 0));
  if (dailyInstallment > 0 && balance > 0) return Math.min(dailyInstallment * missedDays, balance);
  return Math.max(balance, 0);
}

function dueAt(customer = {}) {
  return resolveRepaymentDueAt(customer);
}

async function audit(user, action, targetTable, targetId, details = {}) {
  await getSupabase().from('admin_audit_logs').insert({
    actor_user_id: user.id,
    actor_email: user.email,
    action,
    target_table: targetTable,
    target_id: targetId,
    details
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { message: 'Method not allowed.' });
    return;
  }

  try {
    assertBodySize(req);
    await assertRateLimit(req, { scope: 'admin-finance-follow-up', limit: 20, windowMs: 60_000 });
    const user = await requirePortalUser(req, ['admin']);
    const body = await readJson(req);
    const paymentIds = Array.isArray(body.paymentIds) ? body.paymentIds.map(String).filter(Boolean) : [];
    const customerIds = Array.isArray(body.customerIds) ? body.customerIds.map(String).filter(Boolean) : [];

    if (paymentIds.length === 0 && customerIds.length === 0) {
      sendJson(res, 400, { message: 'Choose one or more overdue customer accounts.' });
      return;
    }

    const paymentCustomers = paymentIds.length
      ? await getSupabase()
          .from('payments')
          .select('customer_id')
          .in('id', paymentIds)
      : { data: [] };
    if (paymentCustomers.error) throw paymentCustomers.error;

    const mergedCustomerIds = [
      ...customerIds,
      ...(paymentCustomers.data || []).map((row) => row.customer_id).filter(Boolean)
    ];
    const uniqueCustomerIds = [...new Set(mergedCustomerIds)];

    if (uniqueCustomerIds.length === 0) {
      sendJson(res, 404, { message: 'No linked customers were found for the selected payments.' });
      return;
    }

    const customersResult = await getSupabase()
      .from('customers')
      .select('*')
      .in('id', uniqueCustomerIds);

    if (customersResult.error) throw customersResult.error;

    const now = new Date();
    const reminderIntervalDays = await resolveReminderIntervalDays();
    const customers = (customersResult.data || [])
      .filter((customer) => Number(customer.balance || 0) > 0 || daysBetween(dueAt(customer), now) >= 0)
      .map((customer) => {
        const overdueDays = Math.max(0, daysBetween(dueAt(customer), now));
        return {
          ...customer,
          overdueDays,
          reminderAmount: reminderAmount(customer, overdueDays)
        };
      });

    if (customers.length === 0) {
      sendJson(res, 404, { message: 'No overdue or due customers were found for the selected accounts.' });
      return;
    }

    const summaryNames = customers.map((customer) => customer.customer_name || 'Customer');
    const totalAmount = customers.reduce((sum, customer) => sum + Number(customer.reminderAmount || 0), 0);
    const maxOverdueDays = customers.reduce((max, customer) => Math.max(max, Number(customer.overdueDays || 0)), 0);
    const summaryTitle = customers.length > 1
      ? `${customers.length} customers need follow-up`
      : 'Payment follow-up';
    const summaryMessage = customers.length > 1
      ? `${summaryNames.join(', ')} are due for payment follow-up.`
      : `${summaryNames[0]} is due for payment follow-up.`;

    const financeNotification = await getSupabase()
      .from('finance_notifications')
      .insert({
        type: customers.length > 1 ? 'payment_overdue_batch' : 'payment_overdue',
        title: summaryTitle,
        message: summaryMessage,
        issue: customers.length > 1
          ? 'Multiple customers require repayment follow-up.'
          : 'Customer requires repayment follow-up.',
        follow_up: 'Contact the assigned agent, send the customer reminder, and confirm repayment progress.',
        customer_name: summaryNames.join(', '),
        amount: totalAmount,
        overdue_days: maxOverdueDays,
        source_portal: 'admin',
        severity: maxOverdueDays >= 3 ? 'critical' : maxOverdueDays > 0 ? 'warning' : 'info',
        status: 'unread'
      })
      .select()
      .single();
    if (financeNotification.error) throw financeNotification.error;

    const outcomePromises = [];
    for (const customer of customers) {
      const reminderClaim = await claimReminderSend(customer, {
        now,
        intervalDays: reminderIntervalDays,
        startAfterDays: 2
      });

      const agentNotification = await getSupabase()
        .from('agent_notifications')
        .insert({
          agent_id: customer.agent_id || null,
          agent_name: customer.agent_name || null,
          agent_code: customer.agent_id || null,
          customer_id: customer.id,
          customer_name: customer.customer_name,
          message: customer.overdueDays > 0
            ? `${customer.customer_name} is ${customer.overdueDays} day${customer.overdueDays === 1 ? '' : 's'} overdue. Follow up overdue amount KES ${Number(customer.reminderAmount || 0).toLocaleString('en-KE')}. Balance KES ${Number(customer.balance || 0).toLocaleString('en-KE')}.`
            : `${customer.customer_name} has a payment due today. Follow up payment of KES ${Number(customer.reminderAmount || 0).toLocaleString('en-KE')}.`,
          status: 'queued',
          source_portal: 'admin'
        })
        .select()
        .single();
      if (agentNotification.error) throw agentNotification.error;

      if (!reminderClaim.claimed) {
        logWarn('admin_finance_follow_up.sms_skipped', {
          customerId: customer.id,
          customerName: customer.customer_name || '',
          reason: reminderClaim.reason,
          overdueDays: reminderClaim.overdueDays,
          intervalDays: reminderIntervalDays
        });

        outcomes.push({
          customerId: customer.id,
          customerName: customer.customer_name,
          overdueDays: customer.overdueDays,
          reminderAmount: customer.reminderAmount,
          customerSms: { delivered: false, skipped: true, reason: reminderClaim.reason },
          agentSms: { delivered: false, skipped: true, reason: reminderClaim.reason },
          agentNotificationId: agentNotification.data?.id || null
        });
        continue;
      }

      outcomePromises.push((async () => {
        const [customerSms, agentPhoneResult] = await Promise.all([
          sendPaymentReminderSms({
            customer,
            amount: customer.reminderAmount,
            dueDate: customer.due_date,
            overdueDays: customer.overdueDays
          }).catch((error) => {
            logError('admin_finance_follow_up.customer_sms_failed', {
              customerId: customer.id,
              customerName: customer.customer_name || '',
              error
            });
            return { delivered: false, error: error.message };
          }),
          customer.agent_id
            ? getSupabase().from('agents').select('phone').eq('agent_code', customer.agent_id).maybeSingle()
            : Promise.resolve({ data: null })
        ]);

        let agentSms = { delivered: false };
        if (agentPhoneResult?.data?.phone) {
          agentSms = await sendAgentFollowUpSms({
            agentPhone: agentPhoneResult.data.phone,
            customerId: customer.id,
            customerName: customer.customer_name,
            customerPhone: customer.customer_phone,
            overdueDays: customer.overdueDays,
            amount: customer.reminderAmount,
            balance: customer.balance,
            reminderDate: new Date().toISOString().slice(0, 10)
          }).catch((error) => {
            logError('admin_finance_follow_up.agent_sms_failed', {
              customerId: customer.id,
              customerName: customer.customer_name || '',
              error
            });
            return { delivered: false, error: error.message };
          });
        }

        return {
          customerId: customer.id,
          customerName: customer.customer_name,
          overdueDays: customer.overdueDays,
          reminderAmount: customer.reminderAmount,
          customerSms,
          agentSms,
          agentNotificationId: agentNotification.data?.id || null
        };
      })());
    }

    const outcomes = await Promise.all(outcomePromises);

    await audit(user, 'finance_follow_up_sent', 'customers', uniqueCustomerIds.join(','), {
      customers: summaryNames,
      totalAmount,
      maxOverdueDays,
      financeNotificationId: financeNotification.data?.id || null
    });

    sendJson(res, 200, {
      sent: true,
      financeNotification: financeNotification.data,
      outcomes
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { message: error.message });
  }
}
