import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle2, Download } from 'lucide-react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button.jsx';
import { SearchInput } from '@/components/ui/SearchInput.jsx';
import { Section } from '@/components/ui/Section.jsx';
import { StatusPill } from '@/components/ui/StatusPill.jsx';
import { Text } from '@/components/ui/Text.jsx';
import { commissionService } from '@/services/commissionService.js';
import { colors } from '@/theme/colors.js';
import { formatKes } from '@/utils/currency.js';
import { formatDate } from '@/utils/dates.js';
import { humanizeStatus } from '@/utils/status.js';
import { formatPercent, matchesCommissionProductScope } from '@/utils/commission.js';
import { downloadSpreadsheet } from '@/utils/spreadsheetExport.js';
import { normalizeProductScope } from '@/utils/productScope.js';
import { Header } from './PaymentsScreen.jsx';

export function CommissionsScreen({ productTypeScope = 'all' }) {
  const [commissions, setCommissions] = useState([]);
  const [processingId, setProcessingId] = useState('');
  const [agentQuery, setAgentQuery] = useState('');
  const [showAgentPayments, setShowAgentPayments] = useState(false);
  const scope = normalizeProductScope(productTypeScope);
  const filteredCommissions = useMemo(() => {
    const value = agentQuery.trim().toLowerCase();
    const scopedCommissions = commissions.filter((commission) => matchesCommissionProductScope(commission, scope));

    if (!value) return scopedCommissions;

    return scopedCommissions.filter((commission) =>
      `${commission.agentName} ${commission.agentCode} ${commission.agentPhone} ${commission.productType} ${commission.productModel} ${commission.serialNumber} ${commission.chassisNumber}`
        .toLowerCase()
        .includes(value)
    );
  }, [commissions, agentQuery, scope]);
  const pendingTotal = filteredCommissions
    .filter((commission) => commission.status === 'earned')
    .reduce((sum, commission) => sum + Number(commission.amount || 0), 0);
  const agentTotalCommission = filteredCommissions.reduce(
    (sum, commission) => sum + Number(commission.amount || 0),
    0
  );
  const paidCustomerCount = filteredCommissions.filter(
    (commission) => commission.customerPaymentStatus === 'paid'
  ).length;
  const unpaidCustomerCount = filteredCommissions.length - paidCustomerCount;
  const monthlyTotals = filteredCommissions.reduce((months, commission) => {
    const month = commission.earnedMonth || 'No month';
    const current = months.get(month) ?? { month, amount: 0, records: 0 };

    current.amount += Number(commission.amount || 0);
    current.records += 1;
    months.set(month, current);
    return months;
  }, new Map());
  const agentPayments = filteredCommissions.reduce((agents, commission) => {
    const key = commission.agentCode || commission.agentName || 'No agent';
    const current = agents.get(key) ?? {
      agentCode: commission.agentCode,
      agentName: commission.agentName || 'No agent',
      totalCommission: 0,
      isPaid: true,
      hasPayableCommission: false,
      hasQueuedCommission: false
    };

    current.totalCommission += Number(commission.amount || 0);
    current.isPaid = current.isPaid && commission.status === 'paid';
    current.hasPayableCommission = current.hasPayableCommission || ['earned', 'failed'].includes(commission.status);
    current.hasQueuedCommission = current.hasQueuedCommission || commission.status === 'processing';
    agents.set(key, current);
    return agents;
  }, new Map());

  useEffect(() => {
    let mounted = true;
    function loadCommissions() {
      commissionService.listCommissions({ productType: scope || undefined }).then((records) => mounted && setCommissions(records)).catch(() => mounted && setCommissions([]));
    }
    loadCommissions();
    const timer = window.setInterval(loadCommissions, 30000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [scope]);

  async function payAgent(commissionId) {
    setProcessingId(commissionId);

    try {
      const paidCommission = await commissionService.payAgent(commissionId);
      setCommissions((items) =>
        items.map((commission) => (commission.id === commissionId ? paidCommission : commission))
      );
    } catch (error) {
      const refreshed = await commissionService.listCommissions().catch(() => commissions);
      setCommissions(refreshed);
      window.alert(error.message);
    } finally {
      setProcessingId('');
    }
  }

  async function sendFollowUp(commissionId) {
    setProcessingId(commissionId);

    try {
      await commissionService.sendFollowUpNotification(commissionId);
      const refreshed = await commissionService.listCommissions();
      setCommissions(refreshed);
      window.alert('Follow-up notification sent to the agent.');
    } catch (error) {
      window.alert(error.message);
    } finally {
      setProcessingId('');
    }
  }

  async function markAgentPaid(agent) {
    const agentKey = agent.agentCode || agent.agentName;
    const confirmed = window.confirm(`Submit payment request for ${agent.agentName} commissions? The system will complete the money transfer.`);
    if (!confirmed) return;

    setProcessingId(agentKey);

    try {
      const updatedCommissions = await commissionService.markAgentPaid(agentKey);
      const updatedById = new Map(updatedCommissions.map((commission) => [commission.id, commission]));
      setCommissions((items) =>
        items.map((commission) => updatedById.get(commission.id) ?? commission)
      );
    } catch (error) {
      window.alert(error.message);
    } finally {
      setProcessingId('');
    }
  }

  function exportCommissions() {
    const headers = [
      'Agent',
      'Agent code',
      'Agent phone',
      'Customer',
      'Product type',
      'Product model',
      'Product identifier',
      'Customer payment status',
      'Payment percentage',
      'Commission rate',
      'Commission amount',
      'Commission status',
      'Month',
      'Earned date',
      'Paid date'
    ];
    const rows = filteredCommissions.map((commission) => [
      twoNames(commission.agentName),
      String(commission.agentCode || ''),
      String(commission.agentPhone || ''),
      twoNames(commission.customerName),
      humanizeStatus(commission.productType),
      commission.productModel,
      commission.chassisNumber || commission.serialNumber,
      commission.customerPaymentStatus === 'paid' ? 'Paid' : 'Unpaid',
      formatPercent(commission.paymentPercentage),
      formatPercent(commission.commissionRate * 100),
      formatKes(commission.amount),
      humanizeStatus(commission.status),
      commission.earnedMonth,
      formatDate(commission.earnedAt),
      commission.paidAt ? formatDate(commission.paidAt) : ''
    ]);
    const filenameAgent = agentQuery.trim()
      ? agentQuery.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
      : 'all-agents';

    downloadExcel(`commission-records-${filenameAgent}.xlsx`, headers, rows).catch(() => {
      window.alert('Commission export failed. Reload the app and try again.');
    });
  }

  return (
    <View style={styles.page}>
      <Header
        eyebrow="Product sales"
        title="Commissions"
        subtitle={scope === 'phone' ? 'Check agent earnings from phone sales.' : scope === 'bike' ? 'Check agent earnings from bike sales.' : 'Check agent earnings from bikes, phones, and other PAYGO product sales.'}
        action={
          <View style={styles.headerActions}>
            <Button icon={Download} variant="secondary" onPress={exportCommissions}>Export</Button>
            <Button variant="secondary" onPress={() => setShowAgentPayments((visible) => !visible)}>
              {showAgentPayments ? '< Commissions' : 'Agent payments'}
            </Button>
          </View>
        }
      />
      <View style={styles.summary}>
        <View style={styles.searchRow}>
          <View style={styles.searchWrap}>
            <SearchInput value={agentQuery} onChangeText={setAgentQuery} placeholder="Search agent, product, serial, or chassis" />
          </View>
          {agentQuery ? <Button variant="secondary" onPress={() => setAgentQuery('')}>Clear</Button> : null}
        </View>
        <Text style={styles.summaryLabel}>{agentQuery ? 'Selected commission' : 'All product commissions'}</Text>
        <Text style={styles.summaryValue}>{formatKes(agentTotalCommission)}</Text>
        <Text style={styles.summaryNote}>
          {filteredCommissions.length} customers, {paidCustomerCount} paid, {unpaidCustomerCount} unpaid. Pending commission {formatKes(pendingTotal)}.
        </Text>
        <Text style={styles.summaryNote}>{scope === 'phone' ? 'This view shows phone commission records only.' : scope === 'bike' ? 'This view shows bike commission records only.' : 'Sale commissions apply to bikes, phones, and activated PAYGO products.'}</Text>
      </View>

      {showAgentPayments ? (
        <Section title="Agent payments">
          {[...agentPayments.values()].map((agent) => {
            const agentKey = agent.agentCode || agent.agentName;
            const isPaid = agent.isPaid;
            const isQueued = !agent.hasPayableCommission && agent.hasQueuedCommission;

            return (
              <View key={agentKey} style={styles.agentPaymentRow}>
              <View style={styles.agentPaymentName}>
                <Text style={styles.name}>{agent.agentName}</Text>
                <Text style={styles.meta}>{agent.agentCode || 'No agent code'}</Text>
              </View>
                <Text style={styles.agentPaymentAmount}>{formatKes(agent.totalCommission)}</Text>
                <Button
                  icon={CheckCircle2}
                  variant="secondary"
                  disabled={isPaid || isQueued || processingId === agentKey}
                  onPress={() => markAgentPaid(agent)}
                >
                  {isPaid ? 'Paid' : isQueued ? 'Queued' : processingId === agentKey ? 'Submitting' : 'Pay'}
                </Button>
              </View>
            );
          })}
          {filteredCommissions.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.meta}>No commission payment records found.</Text>
            </View>
          )}
        </Section>
      ) : (
        <>
          <Section title="Monthly commission totals">
            {[...monthlyTotals.values()].map((month) => (
              <View key={month.month} style={styles.monthRow}>
                <Text style={styles.name}>{month.month}</Text>
                <Text style={styles.cell}>{month.records} customer records</Text>
                <Text style={styles.monthAmount}>{formatKes(month.amount)}</Text>
              </View>
            ))}
            {filteredCommissions.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.meta}>No product commission records found.</Text>
              </View>
            )}
          </Section>

          <Section title="Commission ledger">
            {filteredCommissions.map((commission) => (
              <View key={commission.id} style={styles.row}>
                <View style={styles.agent}>
                  <Text style={styles.name}>{commission.agentName}</Text>
                  <Text style={styles.meta}>{commission.agentCode} | {commission.agentPhone}</Text>
                  <Text style={styles.meta}>{commission.customerName}</Text>
                  <Text style={styles.meta}>
                    {humanizeStatus(commission.productType)}: {commission.productModel}
                    {commission.chassisNumber || commission.serialNumber
                      ? ` | ${commission.chassisNumber || commission.serialNumber}`
                      : ''}
                  </Text>
                  <Text style={styles.meta}>Customer payment: {commission.customerPaymentStatus === 'paid' ? 'Paid' : 'Unpaid'}</Text>
                  {commission.approvalReference && (
                    <Text style={styles.meta}>Approval ref: {commission.approvalReference}</Text>
                  )}
                  {commission.payoutStatus && (
                    <Text style={styles.meta}>Payment request: {humanizeStatus(commission.payoutStatus)}</Text>
                  )}
                  {commission.payoutError && (
                    <Text style={styles.errorText}>{commission.payoutError}</Text>
                  )}
                  {commission.notificationMessage && (
                    <Text style={styles.errorText}>{commission.notificationMessage}</Text>
                  )}
                  {commission.followUpSentAt && (
                    <Text style={styles.meta}>Follow-up sent {formatDate(commission.followUpSentAt)}</Text>
                  )}
                </View>
                <Text style={styles.cell}>{humanizeStatus(commission.type)}</Text>
                <View style={styles.dateCell}>
                  <Text style={styles.cellText}>{formatPercent(commission.paymentPercentage)} paid</Text>
                  <Text style={styles.meta}>{formatPercent(commission.commissionRate * 100)} commission rate</Text>
                </View>
                <Text style={styles.amount}>{formatKes(commission.amount)}</Text>
                <View style={styles.dateCell}>
                  <Text style={styles.cellText}>{formatDate(commission.earnedAt)}</Text>
                  {commission.paidAt && <Text style={styles.meta}>Paid {formatDate(commission.paidAt)}</Text>}
                  <Text style={styles.meta}>{commission.payoutNote}</Text>
                </View>
                <StatusPill status={commission.status} />
                <StatusPill status={commission.customerPaymentStatus} />
                {commission.status === 'follow_up' && (
                  <Button
                    icon={Bell}
                    variant="secondary"
                    disabled={Boolean(commission.followUpSentAt)}
                    onPress={() => sendFollowUp(commission.id)}
                  >
                    {commission.followUpSentAt
                      ? 'Sent'
                      : processingId === commission.id ? 'Sending' : 'Follow-up'}
                  </Button>
                )}
                {['earned', 'failed'].includes(commission.status) && (
                  <Button
                    icon={CheckCircle2}
                    variant="secondary"
                    onPress={() => payAgent(commission.id)}
                  >
                    {processingId === commission.id
                      ? 'Submitting'
                      : commission.status === 'failed' ? 'Retry pay' : 'Pay'}
                  </Button>
                )}
              </View>
            ))}
          </Section>
        </>
      )}
    </View>
  );
}

function twoNames(value) {
  const names = String(value || '').trim().split(/\s+/).filter(Boolean);
  return names.slice(0, 2).join(' ');
}

async function downloadExcel(filename, headers, rows) {
  downloadSpreadsheet(filename, [{ name: 'Commissions', rows: [headers, ...rows] }]);
}

const styles = StyleSheet.create({
  page: { gap: 18 },
  summary: { backgroundColor: 'var(--app-surface)', borderWidth: 1, borderColor: 'var(--app-border)', borderRadius: 8, padding: 16 },
  summaryLabel: { color: 'var(--app-muted)', fontSize: 12, fontWeight: '500' },
  summaryValue: { fontSize: 24, fontWeight: '500', marginTop: 4 },
  summaryNote: { color: 'var(--app-muted)', fontSize: 12, marginTop: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  searchWrap: { minWidth: 260, flex: 1 },
  monthRow: { padding: 14, borderBottomWidth: 1, borderBottomColor: 'var(--app-border)', flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  row: { padding: 14, borderBottomWidth: 1, borderBottomColor: 'var(--app-border)', flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  agentPaymentRow: { padding: 14, borderBottomWidth: 1, borderBottomColor: 'var(--app-border)', flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  agentPaymentName: { flex: 1, minWidth: 220 },
  agentPaymentAmount: { flex: 1, minWidth: 140, fontWeight: '500', textAlign: 'right' },
  agent: { flex: 1.4, minWidth: 210 },
  name: { fontWeight: '500' },
  meta: { color: 'var(--app-muted)', fontSize: 12, marginTop: 3 },
  cell: { flex: 1, minWidth: 120, color: 'var(--app-muted)', fontWeight: '500' },
  cellText: { color: 'var(--app-muted)', fontWeight: '500' },
  dateCell: { flex: 1, minWidth: 130 },
  amount: { flex: 1, minWidth: 110, fontWeight: '500' },
  monthAmount: { flex: 1, minWidth: 110, fontWeight: '500', textAlign: 'right' },
  errorText: { color: colors.danger, fontSize: 12, marginTop: 3 },
  emptyState: { padding: 14 }
});

