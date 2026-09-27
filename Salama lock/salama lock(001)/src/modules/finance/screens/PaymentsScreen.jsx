import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock3, Download, Pencil, Plus } from 'lucide-react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/Button.jsx';
import { SearchInput } from '@/components/ui/SearchInput.jsx';
import { Section } from '@/components/ui/Section.jsx';
import { StatusPill } from '@/components/ui/StatusPill.jsx';
import { Text } from '@/components/ui/Text.jsx';
import { paymentService } from '@/services/paymentService.js';
import { colors } from '@/theme/colors.js';
import { formatKes } from '@/utils/currency.js';
import { formatDate } from '@/utils/dates.js';
import { downloadSpreadsheet } from '@/utils/spreadsheetExport.js';
import { matchesProductScope, normalizeProductScope } from '@/utils/productScope.js';
import { buildRepaymentHealthRows } from '@/utils/repaymentHealth.js';
import { financialPaymentAmount } from '@/utils/financialLedger.js';

const NO_DATA = 'No data yet';

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function displayValue(value) {
  return hasValue(value) ? value : NO_DATA;
}

function displayMoney(value) {
  return hasValue(value) && !Number.isNaN(Number(value)) ? formatKes(Number(value)) : NO_DATA;
}

function displayDate(value) {
  return hasValue(value) ? formatDate(value) : NO_DATA;
}

function parseMoneyValue(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }

  const match = String(value ?? '')
    .replace(/,/g, '')
    .match(/-?\d+(?:\.\d+)?/);

  return match ? Number(match[0]) : NaN;
}

function displayAgentCode(payment) {
  return payment.agentId || payment.agentCode || NO_DATA;
}

function identifierForPayment(payment) {
  return payment.chassisNumber || payment.serialNumber;
}

function isBalanceAdjustment(payment) {
  return String(payment?.sourcePortal || '').trim().toLowerCase() === 'finance_balance_adjustment';
}

function isEmptyFinanceCorrection(payment) {
  return String(payment?.sourcePortal || '').trim().toLowerCase() === 'finance_correction'
    && financialPaymentAmount(payment) === 0;
}

export function PaymentsScreen({ onPaymentRecordsChange, productTypeScope = 'all' }) {
  const manualActionRef = useRef(null);
  const manualFormRef = useRef(null);
  const financialEditRef = useRef(null);
  const manualPaymentSavingRef = useRef(false);
  const manualSubmissionIdRef = useRef(null);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [paymentRecords, setPaymentRecords] = useState([]);
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const [editingFinancials, setEditingFinancials] = useState(null);
  const [savingFinancials, setSavingFinancials] = useState(false);
  const [savingManualPayment, setSavingManualPayment] = useState(false);
  const [repaymentWatchOpen, setRepaymentWatchOpen] = useState(false);
  const [statusToast, setStatusToast] = useState(null);
  const [manualPayment, setManualPayment] = useState({
    customerName: '',
    customerPhone: '',
    agentName: '',
    serialNumber: '',
    depositCredit: '',
    paygoPayment: '',
    date: new Date().toISOString().slice(0, 10),
    status: 'paid'
  });

  useEffect(() => {
    let mounted = true;
    function loadPayments() {
      const scope = normalizeProductScope(productTypeScope);
      paymentService.listPayments({ productType: scope || undefined }).then((records) => mounted && setPaymentRecords(records)).catch(() => mounted && setPaymentRecords([]));
    }
    loadPayments();
    const timer = window.setInterval(loadPayments, 30000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [productTypeScope]);

  useEffect(() => {
    if (!manualFormOpen) return undefined;

    function elementContains(ref, target) {
      return (
        ref.current &&
        typeof ref.current.contains === 'function' &&
        ref.current.contains(target)
      );
    }

    function handleOutsideClick(event) {
      if (elementContains(manualFormRef, event.target) || elementContains(manualActionRef, event.target)) {
        return;
      }
      setManualFormOpen(false);
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setManualFormOpen(false);
      }
    }

    document.addEventListener('pointerdown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [manualFormOpen]);

  useEffect(() => {
    if (!statusToast) return undefined;
    const timer = window.setTimeout(() => setStatusToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [statusToast]);

  useEffect(() => {
    if (!editingFinancials) return undefined;

    const frame = window.requestAnimationFrame(() => {
      financialEditRef.current?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'start'
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [editingFinancials?.id]);

  useEffect(() => {
    if (!editingFinancials) return undefined;

    function handleEscape(event) {
      if (event.key === 'Escape' && !savingFinancials) {
        setEditingFinancials(null);
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [Boolean(editingFinancials), savingFinancials]);

  const scopedPaymentRecords = useMemo(() => {
    const scope = normalizeProductScope(productTypeScope);
    return paymentRecords.filter((payment) => matchesProductScope(payment.productType, scope));
  }, [paymentRecords, productTypeScope]);

  const payments = useMemo(() => {
    const value = deferredQuery.trim().toLowerCase();
    const visibleRecords = scopedPaymentRecords.filter((payment) => !isEmptyFinanceCorrection(payment));
    if (!value) return visibleRecords;

    return visibleRecords.filter((payment) =>
      String(payment.searchIndex ?? '').includes(value)
    );
  }, [deferredQuery, scopedPaymentRecords]);

  const repaymentRows = useMemo(() => buildRepaymentHealthRows(scopedPaymentRecords), [scopedPaymentRecords]);

  const repaymentSummary = useMemo(() => {
    return repaymentRows.reduce(
      (summary, row) => {
        summary[row.healthKey] += 1;
        return summary;
      },
      { good: 0, average: 0, bad: 0 }
    );
  }, [repaymentRows]);

  function getExportRows() {
    const headers = [
      'Customer',
      'Phone',
      'Receipt',
      'Product identifier',
      'Repayment Health',
      'Overdue Days',
      'Deposit / Credit',
      'Paygo Payment',
      'Payment Amount',
      'Daily Target',
      'Balance',
      'Date',
      'Agent / Agent code',
      'Status',
      'Paygo Account',
      'Follow Up',
      'Source'
    ];
    const rows = payments.map((payment) => [
      payment.customerName,
      payment.customerPhone,
      isBalanceAdjustment(payment) ? 'Balance adjustment' : payment.receipt,
      identifierForPayment(payment),
      payment.repaymentHealthLabel || payment.repaymentHealth || NO_DATA,
      hasValue(payment.overdueDays) ? payment.overdueDays : NO_DATA,
      displayMoney(payment.depositCredit),
      displayMoney(payment.paygoPayment),
      displayMoney(financialPaymentAmount(payment)),
      displayMoney(payment.dailyTarget),
      displayMoney(payment.balance),
      displayDate(payment.date),
      `${payment.agentName} / ${displayAgentCode(payment)}`,
      payment.status === 'paid' ? 'Paid' : 'Unpaid',
      payment.paygoState,
      payment.followUp,
      payment.sourcePortal
    ]);

    return { headers, rows };
  }

  function downloadCsv() {
    const { headers, rows } = getExportRows();
    downloadCsvTable('payment-records.csv', headers, rows);
  }

  function updateManualPayment(field, value) {
    if (!manualPaymentSavingRef.current) manualSubmissionIdRef.current = null;
    setManualPayment((current) => ({ ...current, [field]: value }));
  }

  function startFinancialEdit(payment) {
    setManualFormOpen(false);
    const balance = Number(payment.balance ?? 0);
    const storedTotalPayable = Number(payment.totalPayable ?? 0);
    const accountPaidAmount = Number(payment.customerPaidAmount ?? payment.paidAmount ?? 0);
    const inferredTotalPayable = balance + accountPaidAmount;
    setEditingFinancials({
      id: payment.id,
      customerName: payment.customerName,
      depositCredit: String(payment.depositCredit ?? 0),
      paygoPayment: String(payment.paygoPayment ?? 0),
      totalPayable: String(storedTotalPayable > 0 ? storedTotalPayable : inferredTotalPayable),
      balance: String(balance),
      dailyInstallment: String(payment.dailyInstallment ?? payment.dailyTarget ?? 0),
      status: payment.status === 'paid' ? 'paid' : 'unpaid'
    });
  }

  function updateFinancialEdit(field, value) {
    setEditingFinancials((current) => current ? { ...current, [field]: value } : current);
  }

  async function saveFinancialEdit() {
    if (!editingFinancials || savingFinancials) return;

      const financials = {
      depositCredit: parseMoneyValue(editingFinancials.depositCredit),
      paygoPayment: parseMoneyValue(editingFinancials.paygoPayment),
      totalPayable: parseMoneyValue(editingFinancials.totalPayable),
      balance: parseMoneyValue(editingFinancials.balance),
      dailyInstallment: parseMoneyValue(editingFinancials.dailyInstallment),
      status: editingFinancials.status
    };
    const invalidField = [
      ['Deposit / Credit', financials.depositCredit, true],
      ['PAYGO payment', financials.paygoPayment, true],
      ['Total payable', financials.totalPayable, false],
      ['Current balance', financials.balance, true],
      ['Daily payment', financials.dailyInstallment, false]
    ].find(([, value, zeroAllowed]) => !Number.isFinite(value) || value < 0 || (!zeroAllowed && value === 0));

    if (invalidField) {
      window.alert(`${invalidField[0]} must be ${invalidField[2] ? 'zero or a positive number' : 'greater than zero'}.`);
      return;
    }
    if (financials.balance > financials.totalPayable) {
      window.alert(`Current balance cannot exceed total payable (${formatKes(financials.totalPayable)}).`);
      return;
    }

    const editSnapshot = editingFinancials;
    const originalPayment = paymentRecords.find((payment) => payment.id === editingFinancials.id) || null;
    setSavingFinancials(true);
    setEditingFinancials(null);
    setPaymentRecords((records) => records.map((payment) => (
      payment.id === editSnapshot.id
        ? {
            ...payment,
            ...financials,
            paidAmount: Math.max(financials.totalPayable - financials.balance, 0)
          }
        : payment
    )));
    setStatusToast({ tone: 'success', message: 'Saving financial update...' });
    try {
      const savedPayment = await paymentService.updateFinancials(editSnapshot.id, financials);
      setPaymentRecords((records) => records.map((payment) => (
        payment.id === savedPayment.replacedPaymentId ? { ...payment, ...savedPayment } : payment
      )));
      onPaymentRecordsChange?.();
      setStatusToast({ tone: 'success', message: 'Payment correction recorded with an audit trail' });
    } catch (error) {
      if (originalPayment) {
        setPaymentRecords((records) => records.map((payment) => (
          payment.id === editSnapshot.id ? originalPayment : payment
        )));
      }
      setEditingFinancials(editSnapshot);
      setStatusToast({ tone: 'danger', message: 'Financial update was not saved.' });
      window.alert(error.message || 'Financial values could not be updated.');
    } finally {
      setSavingFinancials(false);
    }
  }

  function setManualStatus(status) {
    updateManualPayment('status', status);
    setStatusToast({
      tone: status === 'paid' ? 'success' : 'danger',
      message: status === 'paid' ? 'Marked paid' : 'Marked unpaid'
    });
  }

  function generateReceipt(paymentId) {
    return `SALAMA LOCK-CM-${String(paymentId || '').replace(/^MAN-/i, '')}`;
  }

  function generatePaymentId() {
    return `MAN-${window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  }

  async function saveManualPayment() {
    if (manualPaymentSavingRef.current) return;

    const depositCredit = parseMoneyValue(manualPayment.depositCredit);
    const paygoPayment = parseMoneyValue(manualPayment.paygoPayment);
    const hasValidDate = /^\d{4}-\d{2}-\d{2}$/.test(manualPayment.date);

    if (
      !manualPayment.customerName.trim() ||
      !manualPayment.customerPhone.trim() ||
      !manualPayment.agentName.trim() ||
      !Number.isFinite(depositCredit) ||
      !Number.isFinite(paygoPayment) ||
      !hasValidDate
    ) {
      window.alert('Complete customer, phone, agent, deposit, Paygo payment, and date as YYYY-MM-DD.');
      return;
    }

    let savedPayment;
    const submissionId = manualSubmissionIdRef.current || generatePaymentId();
    manualSubmissionIdRef.current = submissionId;
    manualPaymentSavingRef.current = true;
    setSavingManualPayment(true);

    try {
      const identifier = manualPayment.serialNumber.trim();

      savedPayment = await paymentService.saveManualPayment({
        id: submissionId,
        customerName: manualPayment.customerName.trim(),
        customerPhone: manualPayment.customerPhone.trim(),
        receipt: generateReceipt(submissionId),
        agentName: manualPayment.agentName.trim(),
        serialNumber: identifier,
        chassisNumber: identifier,
        depositCredit: Number(depositCredit),
        paygoPayment: Number(paygoPayment),
        date: `${manualPayment.date}T12:00:00`,
        status: manualPayment.status,
        sourcePortal: 'Manual payment'
      });
    } catch (error) {
      window.alert(error.message || 'Payment was not saved. Check the payment details and try again.');
      return;
    } finally {
      manualPaymentSavingRef.current = false;
      setSavingManualPayment(false);
    }

    manualSubmissionIdRef.current = null;
    setPaymentRecords((records) => [savedPayment, ...records]);
    onPaymentRecordsChange?.();
    setManualFormOpen(false);
    setManualPayment({
      customerName: '',
      customerPhone: '',
      agentName: '',
      serialNumber: '',
      depositCredit: '',
      paygoPayment: '',
      date: new Date().toISOString().slice(0, 10),
      status: 'paid'
    });
  }

  function downloadXls() {
    const { headers, rows } = getExportRows();
    downloadExcelTable('payment-records.xlsx', 'Payment Records', headers, rows).catch(() => {
      window.alert('Excel export failed. Try CSV export or reload the app.');
    });
  }

  return (
    <View style={styles.page}>
      <Header
        eyebrow="Money activity"
        title="Payments"
        subtitle="Records are matched with customer details registered by agents in the agent portal."
        action={
          <View ref={manualActionRef}>
            <Button icon={Plus} onPress={() => {
              setEditingFinancials(null);
              setManualFormOpen((open) => !open);
            }}>Manual payment</Button>
          </View>
        }
      />

      {manualFormOpen && (
        <View ref={manualFormRef} style={styles.manualOverlay}>
          <Pressable onPress={(event) => event.stopPropagation()}>
            <Section title="Manual payment">
              <View style={styles.manualForm}>
            <TextInput
              value={manualPayment.customerName}
              onChangeText={(value) => updateManualPayment('customerName', value)}
              style={styles.formInput}
              placeholder="Customer name"
              placeholderTextColor="var(--app-muted)"
            />
            <TextInput
              value={manualPayment.customerPhone}
              onChangeText={(value) => updateManualPayment('customerPhone', value)}
              style={styles.formInput}
              placeholder="Customer phone"
              placeholderTextColor="var(--app-muted)"
            />
            <TextInput
              value={manualPayment.agentName}
              onChangeText={(value) => updateManualPayment('agentName', value)}
              style={styles.formInput}
              placeholder="Agent name"
              placeholderTextColor="var(--app-muted)"
            />
            <TextInput
              value={manualPayment.serialNumber}
              onChangeText={(value) => updateManualPayment('serialNumber', value)}
              style={styles.formInput}
              placeholder="Chassis or serial number"
              placeholderTextColor="var(--app-muted)"
            />
            <TextInput
              value={manualPayment.depositCredit}
              onChangeText={(value) => updateManualPayment('depositCredit', value)}
              style={styles.formInput}
              placeholder="Deposit / Credit"
              placeholderTextColor="var(--app-muted)"
            />
            <TextInput
              value={manualPayment.paygoPayment}
              onChangeText={(value) => updateManualPayment('paygoPayment', value)}
              style={styles.formInput}
              placeholder="Paygo payment"
              placeholderTextColor="var(--app-muted)"
            />
            <TextInput
              value={manualPayment.date}
              onChangeText={(value) => updateManualPayment('date', value)}
              style={styles.formInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="var(--app-muted)"
            />
            <View style={styles.manualActions}>
              <Pressable
                onPress={() => setManualStatus('paid')}
                style={[
                  styles.statusChoice,
                  manualPayment.status === 'paid' && styles.statusChoiceActive
                ]}
              >
                <Text style={[styles.statusChoiceText, manualPayment.status === 'paid' && styles.statusChoiceTextActive]}>Paid</Text>
              </Pressable>
              <Pressable
                onPress={() => setManualStatus('unpaid')}
                style={[
                  styles.statusChoice,
                  manualPayment.status === 'unpaid' && styles.statusChoiceActive
                ]}
              >
                <Text style={[styles.statusChoiceText, manualPayment.status === 'unpaid' && styles.statusChoiceTextActive]}>Unpaid</Text>
              </Pressable>
              <Button onPress={saveManualPayment} disabled={savingManualPayment}>
                {savingManualPayment ? 'Saving...' : 'Save payment'}
              </Button>
            </View>
            {statusToast && (
              <View
                style={[
                  styles.statusToast,
                  statusToast.tone === 'success' ? styles.statusToastSuccess : styles.statusToastDanger
                ]}
              >
                <Text
                  style={[
                    styles.statusToastText,
                    statusToast.tone === 'success' ? styles.statusToastTextSuccess : styles.statusToastTextDanger
                  ]}
                >
                  {statusToast.message}
                </Text>
              </View>
            )}
              </View>
            </Section>
          </Pressable>
        </View>
      )}

      {editingFinancials && (
        <View ref={financialEditRef} style={styles.financialEditor}>
          <Section title={`Edit financials${editingFinancials.customerName ? ` - ${editingFinancials.customerName}` : ''}`}>
            <View style={styles.manualForm}>
              <Text style={styles.formHelp}>
                Saving preserves the original payment and creates an audited correction revision.
              </Text>
              <View style={styles.financialGrid}>
                <EditMoneyField label="Deposit / Credit" value={editingFinancials.depositCredit} onChangeText={(value) => updateFinancialEdit('depositCredit', value)} />
                <EditMoneyField label="PAYGO payment" value={editingFinancials.paygoPayment} onChangeText={(value) => updateFinancialEdit('paygoPayment', value)} />
                <EditMoneyField label="Total payable" value={editingFinancials.totalPayable} onChangeText={(value) => updateFinancialEdit('totalPayable', value)} />
                <EditMoneyField label="Current balance" value={editingFinancials.balance} onChangeText={(value) => updateFinancialEdit('balance', value)} />
                <EditMoneyField label="Daily payment" value={editingFinancials.dailyInstallment} onChangeText={(value) => updateFinancialEdit('dailyInstallment', value)} />
              </View>
              <View style={styles.manualActions}>
                <Pressable
                  onPress={() => updateFinancialEdit('status', 'paid')}
                  style={[styles.statusChoice, editingFinancials.status === 'paid' && styles.statusChoiceActive]}
                >
                  <Text style={[styles.statusChoiceText, editingFinancials.status === 'paid' && styles.statusChoiceTextActive]}>Paid</Text>
                </Pressable>
                <Pressable
                  onPress={() => updateFinancialEdit('status', 'unpaid')}
                  style={[styles.statusChoice, editingFinancials.status === 'unpaid' && styles.statusChoiceActive]}
                >
                  <Text style={[styles.statusChoiceText, editingFinancials.status === 'unpaid' && styles.statusChoiceTextActive]}>Unpaid</Text>
                </Pressable>
                <Button onPress={saveFinancialEdit} disabled={savingFinancials}>
                  {savingFinancials ? 'Saving...' : 'Save financials'}
                </Button>
                <Button variant="secondary" onPress={() => setEditingFinancials(null)} disabled={savingFinancials}>Cancel</Button>
              </View>
            </View>
          </Section>
        </View>
      )}

      <Section
        title="Repayment watch"
        action={
          <Button
            icon={repaymentWatchOpen ? ChevronUp : ChevronDown}
            variant="secondary"
            onPress={() => setRepaymentWatchOpen((open) => !open)}
          >
            {repaymentWatchOpen ? 'Hide accounts' : `Show accounts (${repaymentRows.length})`}
          </Button>
        }
      >
        <View style={styles.healthSummaryGrid}>
          <HealthSummaryCard
            icon={CheckCircle2}
            label="Green"
            value={repaymentSummary.good}
            detail="On schedule"
            tone="good"
          />
          <HealthSummaryCard
            icon={Clock3}
            label="Amber"
            value={repaymentSummary.average}
            detail="Needs follow-up"
            tone="average"
          />
          <HealthSummaryCard
            icon={AlertTriangle}
            label="Red"
            value={repaymentSummary.bad}
            detail="2+ days overdue"
            tone="bad"
          />
        </View>

        {repaymentWatchOpen ? (
          <View style={styles.healthWatchList}>
            {repaymentRows.length === 0 ? (
              <View style={styles.healthWatchEmpty}>
                <Text style={styles.healthWatchEmptyText}>No repayment accounts are available in this scope yet.</Text>
              </View>
            ) : (
              repaymentRows.map((row) => (
                <View
                  key={row.id}
                  style={[
                    styles.healthWatchRow,
                    row.healthKey === 'good' && styles.healthWatchRowGood,
                    row.healthKey === 'average' && styles.healthWatchRowAverage,
                    row.healthKey === 'bad' && styles.healthWatchRowBad
                  ]}
                >
                  <View style={styles.healthWatchMain}>
                    <View style={styles.healthWatchHeading}>
                      <View style={styles.healthWatchTitleBlock}>
                        <Text style={styles.primary}>{row.customerName}</Text>
                        <Text style={styles.healthWatchSubtext}>{displayValue(row.customerPhone)}</Text>
                      </View>
                      <StatusPill status={row.healthStatus} />
                    </View>
                    <Text style={styles.healthWatchNote}>{row.healthNote}</Text>
                  </View>
                  <View style={styles.healthWatchMeta}>
                    <MetaMetric label="Daily target" value={displayMoney(row.dailyAmount)} />
                    <MetaMetric label="Balance" value={displayMoney(row.balance)} />
                    <MetaMetric label="Overdue days" value={`${row.overdueDays} day${row.overdueDays === 1 ? '' : 's'}`} />
                    <MetaMetric label="Agent" value={displayValue(row.agentName)} />
                  </View>
                </View>
              ))
            )}
          </View>
        ) : (
          <View style={styles.healthWatchEmpty}>
            <Text style={styles.healthWatchEmptyText}>Customer details are hidden. Open them only when repayment follow-up is needed.</Text>
          </View>
        )}
      </Section>

      <Section
        title={`Payment records (${payments.length})`}
        action={<SearchInput value={query} onChangeText={setQuery} placeholder={normalizeProductScope(productTypeScope) === 'phone' ? 'Search phone payments' : normalizeProductScope(productTypeScope) === 'bike' ? 'Search bike payments' : 'Search payments'} />}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tableScroll}
          contentContainerStyle={styles.tableScrollContent}
        >
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, styles.customerCol]}>Customer</Text>
              <Text style={[styles.th, styles.phoneCol]}>Phone / Receipt</Text>
              <Text style={[styles.th, styles.chassisCol]}>Product identifier</Text>
              <Text style={[styles.th, styles.statusCol]}>Health</Text>
              <Text style={[styles.th, styles.overdueCol]}>Overdue</Text>
              <Text style={[styles.th, styles.moneyCol]}>Deposit / Credit</Text>
              <Text style={[styles.th, styles.moneyCol]}>Paygo Payment</Text>
              <Text style={[styles.th, styles.moneyCol]}>Payment Amount</Text>
              <Text style={[styles.th, styles.moneyCol]}>Daily Target</Text>
              <Text style={[styles.th, styles.moneyCol]}>Balance</Text>
              <Text style={[styles.th, styles.dateCol]}>Date</Text>
              <Text style={[styles.th, styles.agentCol]}>Agent / Agent code</Text>
              <Text style={[styles.th, styles.statusCol]}>Status</Text>
              <Text style={[styles.th, styles.statusCol]}>Paygo Account</Text>
              <Text style={[styles.th, styles.actionCol]}>Actions</Text>
            </View>
            {payments.map((payment) => (
              <View key={payment.id} style={styles.tableRow}>
                <View style={styles.customerCol}>
                  <Text style={styles.primary}>{displayValue(payment.customerName)}</Text>
                </View>
                <View style={styles.phoneCol}>
                  <Text style={styles.cell}>{displayValue(payment.customerPhone)}</Text>
                  <Text style={styles.muted}>{isBalanceAdjustment(payment) ? 'Balance adjustment' : displayValue(payment.receipt)}</Text>
                </View>
                <Text style={[styles.cell, styles.chassisCol]}>{displayValue(identifierForPayment(payment))}</Text>
                <View style={styles.statusCol}><StatusPill status={payment.repaymentHealthStatus || payment.repaymentHealth || 'good'} /></View>
                <Text style={[styles.cellStrong, styles.overdueCol]}>{hasValue(payment.overdueDays) ? payment.overdueDays : NO_DATA}</Text>
                <Text style={[styles.cellStrong, styles.moneyCol]}>{displayMoney(payment.depositCredit)}</Text>
                <Text style={[styles.cellStrong, styles.moneyCol]}>{displayMoney(payment.paygoPayment)}</Text>
                <Text style={[styles.cellStrong, styles.moneyCol]}>{displayMoney(financialPaymentAmount(payment))}</Text>
                <Text style={[styles.cellStrong, styles.moneyCol]}>{displayMoney(payment.dailyTarget)}</Text>
                <Text style={[styles.cellStrong, styles.moneyCol]}>{displayMoney(payment.balance)}</Text>
                <Text style={[styles.cell, styles.dateCol]}>{displayDate(payment.date)}</Text>
                <View style={styles.agentCol}>
                  <Text style={styles.cell}>{displayValue(payment.agentName)}</Text>
                  <Text style={styles.muted}>{displayAgentCode(payment)}</Text>
                </View>
                <View style={styles.statusCol}><StatusPill status={payment.status} /></View>
                <View style={styles.statusCol}><StatusPill status={payment.paygoState} /></View>
                <View style={styles.actionCol}>
                  {isBalanceAdjustment(payment) ? (
                    <Text style={styles.muted}>Audited</Text>
                  ) : (
                    <Pressable onPress={() => startFinancialEdit(payment)} style={styles.editButton}>
                      <Pencil size={14} color={colors.primary} />
                      <Text style={styles.editButtonText}>Edit</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </Section>

      <View style={styles.footerActions}>
        <Button icon={Download} variant="secondary" onPress={downloadCsv}>Export CSV</Button>
        <Button icon={Download} variant="secondary" onPress={downloadXls}>Export Excel</Button>
      </View>
    </View>
  );
}

async function downloadExcelTable(filename, sheetName, headers, rows) {
  downloadSpreadsheet(filename, [{ name: sheetName, rows: [headers, ...rows] }]);
}

function downloadCsvTable(filename, headers, rows) {
  const escapeCsv = (value) => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const content = [headers, ...rows]
    .map((row) => row.map(escapeCsv).join(','))
    .join('\r\n');
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function Header({ eyebrow = 'Activity', title, subtitle, action }) {
  return (
    <View style={styles.header}>
      <View>
        <View style={styles.activityLine}>
          <View style={styles.activityDot} />
          <Text style={styles.eyebrow}>{eyebrow}</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      {action}
    </View>
  );
}

function HealthSummaryCard({ icon: Icon, label, value, detail, tone }) {
  return (
    <View
      style={[
        styles.healthSummaryCard,
        tone === 'good' && styles.healthSummaryCardGood,
        tone === 'average' && styles.healthSummaryCardAverage,
        tone === 'bad' && styles.healthSummaryCardBad
      ]}
    >
      <View style={styles.healthSummaryHeader}>
        <View
          style={[
            styles.healthSummaryIcon,
            tone === 'good' && styles.healthSummaryIconGood,
            tone === 'average' && styles.healthSummaryIconAverage,
            tone === 'bad' && styles.healthSummaryIconBad
          ]}
        >
          <Icon size={18} color={tone === 'good' ? colors.success : tone === 'average' ? colors.warning : colors.danger} />
        </View>
        <Text style={styles.healthSummaryLabel}>{label}</Text>
      </View>
      <Text style={styles.healthSummaryValue}>{value}</Text>
      <Text style={styles.healthSummaryDetail}>{detail}</Text>
    </View>
  );
}

function MetaMetric({ label, value }) {
  return (
    <View style={styles.metaMetric}>
      <Text style={styles.metaMetricLabel}>{label}</Text>
      <Text style={styles.metaMetricValue}>{value}</Text>
    </View>
  );
}

function EditMoneyField({ label, value, onChangeText }) {
  return (
    <View style={styles.editField}>
      <Text style={styles.editLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={styles.formInput}
        inputMode="decimal"
        placeholder="0"
        placeholderTextColor="var(--app-muted)"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 18 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  activityLine: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 },
  activityDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: colors.success },
  eyebrow: { color: 'var(--app-muted)', fontSize: 12, fontWeight: '500' },
  title: { fontSize: 24, fontWeight: '500' },
  subtitle: { color: 'var(--app-muted)', marginTop: 4 },
  watchLabel: { color: 'var(--app-muted)', fontSize: 12, fontWeight: '500' },
  healthSummaryGrid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 14 },
  healthSummaryCard: {
    minWidth: 180,
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 8
  },
  healthSummaryCardGood: { borderColor: '#b9e5d1', backgroundColor: colors.successSoft },
  healthSummaryCardAverage: { borderColor: '#f0d695', backgroundColor: colors.warningSoft },
  healthSummaryCardBad: { borderColor: '#f1b6b6', backgroundColor: colors.dangerSoft },
  healthSummaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  healthSummaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  healthSummaryIconGood: { backgroundColor: '#ffffffcc' },
  healthSummaryIconAverage: { backgroundColor: '#ffffffcc' },
  healthSummaryIconBad: { backgroundColor: '#ffffffcc' },
  healthSummaryLabel: { color: 'var(--app-muted)', fontSize: 13, fontWeight: '500' },
  healthSummaryValue: { fontSize: 28, fontWeight: '600', color: colors.text },
  healthSummaryDetail: { color: 'var(--app-muted)', fontSize: 12 },
  healthWatchList: { gap: 12 },
  healthWatchRow: {
    borderWidth: 1,
    borderLeftWidth: 5,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    flexWrap: 'wrap'
  },
  healthWatchRowGood: { borderColor: '#b9e5d1', borderLeftColor: colors.success, backgroundColor: colors.successSoft },
  healthWatchRowAverage: { borderColor: '#f0d695', borderLeftColor: colors.warning, backgroundColor: colors.warningSoft },
  healthWatchRowBad: { borderColor: '#f1b6b6', borderLeftColor: colors.danger, backgroundColor: colors.dangerSoft },
  healthWatchMain: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 320,
    minWidth: 240,
    gap: 6
  },
  healthWatchHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  healthWatchTitleBlock: { flex: 1, gap: 4 },
  healthWatchSubtext: { color: 'var(--app-muted)', fontSize: 12 },
  healthWatchNote: { color: colors.slate, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  healthWatchMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 420,
    alignItems: 'stretch',
    justifyContent: 'flex-end'
  },
  healthWatchEmpty: {
    borderWidth: 1,
    borderColor: 'var(--app-border)',
    borderRadius: 12,
    padding: 14,
    backgroundColor: 'var(--app-bg)'
  },
  healthWatchEmptyText: { color: 'var(--app-muted)' },
  metaMetric: {
    minWidth: 145,
    flexGrow: 1,
    flexBasis: '48%',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#ffffffcc'
  },
  metaMetricLabel: { color: 'var(--app-muted)', fontSize: 11, fontWeight: '500', marginBottom: 2 },
  metaMetricValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
  tableScroll: { width: '100%' },
  tableScrollContent: { minWidth: '100%', flexGrow: 1, paddingLeft: 1 },
  table: { width: '100%', minWidth: 1690, flexGrow: 1 },
  tableHeader: { minHeight: 42, backgroundColor: 'var(--app-bg)', borderBottomWidth: 1, borderBottomColor: 'var(--app-border)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 6 },
  th: { color: 'var(--app-muted)', fontSize: 12, fontWeight: '500' },
  tableRow: { minHeight: 68, borderBottomWidth: 1, borderBottomColor: 'var(--app-border)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 6 },
  customerCol: { width: 150, flexShrink: 0 },
  phoneCol: { width: 140, flexShrink: 0 },
  agentCol: { width: 130, flexShrink: 0 },
  chassisCol: { width: 130, flexShrink: 0 },
  moneyCol: { width: 120, flexShrink: 0 },
  dateCol: { width: 115, flexShrink: 0 },
  statusCol: { width: 100, flexShrink: 0 },
  overdueCol: { width: 80, flexShrink: 0 },
  actionCol: { width: 100, flexShrink: 0 },
  primary: { fontWeight: '500' },
  muted: { color: 'var(--app-muted)', fontSize: 12, marginTop: 3 },
  cell: { color: 'var(--app-muted)', fontSize: 13, fontWeight: '500' },
  cellStrong: { fontWeight: '500' },
  manualOverlay: { width: '100%' },
  financialEditor: { width: '100%', scrollMarginTop: 16 },
  manualForm: { padding: 14, gap: 10 },
  formInput: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: 'var(--app-border)',
    borderRadius: 6,
    paddingHorizontal: 10,
    color: 'var(--app-text)',
    backgroundColor: 'var(--app-surface)',
    outlineStyle: 'none',
    fontSize: 14
  },
  formHelp: { color: 'var(--app-muted)', fontSize: 13, lineHeight: 18 },
  financialGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  editField: { flexGrow: 1, flexBasis: 220, minWidth: 180, gap: 6 },
  editLabel: { color: 'var(--app-muted)', fontSize: 12, fontWeight: '500' },
  editButton: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'var(--app-border)',
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'var(--app-surface)'
  },
  editButtonText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  manualActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  statusChoice: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'var(--app-border)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  statusChoiceActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  statusChoiceText: { color: 'var(--app-muted)', fontSize: 13, fontWeight: '500' },
  statusChoiceTextActive: { color: '#ffffff' },
  statusToast: {
    alignSelf: 'flex-start',
    minHeight: 34,
    borderRadius: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  statusToastSuccess: {
    backgroundColor: colors.successSoft
  },
  statusToastDanger: {
    backgroundColor: colors.dangerSoft
  },
  statusToastText: { fontSize: 13, fontWeight: '500' },
  statusToastTextSuccess: { color: colors.success },
  statusToastTextDanger: { color: colors.danger },
  footerActions: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, flexWrap: 'wrap' }
});

