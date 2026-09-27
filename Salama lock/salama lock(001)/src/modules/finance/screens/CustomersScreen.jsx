import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/Button.jsx';
import { SearchInput } from '@/components/ui/SearchInput.jsx';
import { Section } from '@/components/ui/Section.jsx';
import { StatusPill } from '@/components/ui/StatusPill.jsx';
import { Text } from '@/components/ui/Text.jsx';
import { customerService } from '@/services/customerService.js';
import { formatKes } from '@/utils/currency.js';
import { formatDate } from '@/utils/dates.js';
import { buildMonthlyPaygoCommissions, formatPercent } from '@/utils/commission.js';
import { Header } from './PaymentsScreen.jsx';

const NO_DATA = 'No data yet';
const AGENT_LOOKUP_DRAFT_KEY = 'SALAMA LOCK-riders-agent-lookup-draft';

function loadAgentLookupDraft() {
  try {
    return JSON.parse(window.sessionStorage.getItem(AGENT_LOOKUP_DRAFT_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveAgentLookupDraft(nextDraft) {
  try {
    window.sessionStorage.setItem(AGENT_LOOKUP_DRAFT_KEY, JSON.stringify(nextDraft));
  } catch {
    // Keep the form usable even when browser storage is unavailable.
  }
}

function clearAgentLookupDraft() {
  try {
    window.sessionStorage.removeItem(AGENT_LOOKUP_DRAFT_KEY);
  } catch {
    // Keep the search flow usable even when browser storage is unavailable.
  }
}

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

function displayAgentCode(payment) {
  return payment.agentId || payment.agentCode || NO_DATA;
}

function identifierForPayment(payment) {
  return payment.chassisNumber || payment.serialNumber;
}

export function CustomersScreen() {
  const [query, setQuery] = useState('');
  const [agentLookupDraft, setAgentLookupDraft] = useState(loadAgentLookupDraft);
  const [hasSearched, setHasSearched] = useState(false);
  const [agentPayments, setAgentPayments] = useState([]);
  const [searchedAgentName, setSearchedAgentName] = useState('');
  const [searchedAgentId, setSearchedAgentId] = useState('');
  const agentName = agentLookupDraft.agentName || '';
  const agentId = agentLookupDraft.agentId || '';

  function updateLookupDraft(field, value) {
    setAgentLookupDraft((current) => {
      const nextDraft = {
        ...current,
        [field]: value
      };
      saveAgentLookupDraft(nextDraft);
      return nextDraft;
    });
  }

  const payments = useMemo(() => {
    const value = query.toLowerCase();
    return agentPayments.filter((payment) =>
      `${payment.customerName} ${payment.customerPhone} ${payment.receipt} ${payment.agentName} ${payment.serialNumber} ${payment.chassisNumber} ${payment.status}`
        .toLowerCase()
        .includes(value)
    );
  }, [agentPayments, query]);

  const searchedAgentLabel = [searchedAgentName, searchedAgentId].filter(Boolean).join(' - ');
  const commissionSummary = useMemo(() => {
    const monthlyCommissions = buildMonthlyPaygoCommissions(agentPayments);
    const commissionByCustomerMonth = new Map(
      monthlyCommissions.map((commission) => [
        `${commission.customerName}|${commission.earnedMonth}`,
        commission
      ])
    );
    const records = payments.map((payment) => {
      const month = String(payment.date || '').slice(0, 7);
      const commission = commissionByCustomerMonth.get(`${payment.customerName}|${month}`);

      return { payment, commission };
    });
    const totalExpectedPaygo = monthlyCommissions.reduce((sum, commission) => sum + Number(commission.monthlyExpectedPaygo || 0), 0);
    const totalCollectedPaygo = monthlyCommissions.reduce((sum, commission) => sum + Number(commission.monthlyPaygoCollected || 0), 0);
    const totalCommission = monthlyCommissions.reduce((sum, commission) => sum + Number(commission.amount || 0), 0);
    const totalPaymentPercentage = totalExpectedPaygo > 0 ? Math.min((totalCollectedPaygo / totalExpectedPaygo) * 100, 100) : 0;

    return {
      totalPaymentPercentage,
      totalCommission,
      records
    };
  }, [agentPayments, payments]);

  async function findAgentCustomers() {
    const nextAgentName = agentName.trim();
    const nextAgentId = agentId.trim();

    if (!nextAgentName || !nextAgentId) {
      window.alert('Enter both agent name and agent ID before showing customer records.');
      return;
    }

    const records = await customerService
      .listPaymentRecordsByAgent({ agentName: nextAgentName, agentId: nextAgentId })
      .catch(() => []);
    setAgentPayments(records);
    setHasSearched(true);
    setSearchedAgentName(nextAgentName);
    setSearchedAgentId(nextAgentId);
    setAgentLookupDraft({ agentName: '', agentId: '' });
    clearAgentLookupDraft();
    setQuery('');
  }

  useEffect(() => {
    if (!hasSearched || !searchedAgentName || !searchedAgentId) return undefined;
    let mounted = true;
    const timer = window.setInterval(() => {
      customerService
        .listPaymentRecordsByAgent({ agentName: searchedAgentName, agentId: searchedAgentId })
        .then((records) => mounted && setAgentPayments(records))
        .catch(() => null);
    }, 30000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [hasSearched, searchedAgentName, searchedAgentId]);

  function closeRecords() {
    setAgentPayments([]);
    setHasSearched(false);
    setQuery('');
    setSearchedAgentName('');
    setSearchedAgentId('');
  }

  return (
    <View style={styles.page}>
      <Header eyebrow="Rider activity" title="Riders" subtitle="See who is paying well, who is behind, and what each rider still owes." />

      <Section title="Agent lookup">
        <View style={styles.lookupForm}>
          <TextInput
            value={agentName}
            onChangeText={(value) => updateLookupDraft('agentName', value)}
            style={styles.formInput}
            placeholder="Agent name"
            placeholderTextColor="var(--app-muted)"
          />
          <TextInput
            value={agentId}
            onChangeText={(value) => updateLookupDraft('agentId', value)}
            style={styles.formInput}
            placeholder="Agent ID"
            placeholderTextColor="var(--app-muted)"
          />
          <Button onPress={findAgentCustomers}>Show customers</Button>
        </View>
      </Section>

      {hasSearched && (
        <Section
          title={`Payment records (${payments.length})${searchedAgentLabel ? ` - ${searchedAgentLabel}` : ''}`}
          action={
            <View style={styles.recordsActions}>
              <SearchInput value={query} onChangeText={setQuery} placeholder="Search shown payments" />
              <Button variant="secondary" onPress={closeRecords}>Close records</Button>
            </View>
          }
        >
          {payments.length > 0 ? (
            <View>
              <View style={styles.commissionSummary}>
                <View style={styles.summaryItem}>
                  <Text style={styles.muted}>Total customer payment</Text>
                  <Text style={styles.summaryValue}>{formatPercent(commissionSummary.totalPaymentPercentage)}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.muted}>Total agent commission</Text>
                  <Text style={styles.summaryValue}>{formatKes(commissionSummary.totalCommission)}</Text>
                </View>
              </View>
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
                    <Text style={[styles.th, styles.moneyCol]}>Total Payable</Text>
                    <Text style={[styles.th, styles.moneyCol]}>Payment %</Text>
                    <Text style={[styles.th, styles.moneyCol]}>Commission Rate</Text>
                    <Text style={[styles.th, styles.moneyCol]}>Commission</Text>
                    <Text style={[styles.th, styles.moneyCol]}>Daily Target</Text>
                    <Text style={[styles.th, styles.moneyCol]}>Balance</Text>
                    <Text style={[styles.th, styles.dateCol]}>Date</Text>
                    <Text style={[styles.th, styles.agentCol]}>Agent / Agent code</Text>
                    <Text style={[styles.th, styles.statusCol]}>Status</Text>
                    <Text style={[styles.th, styles.statusCol]}>Paygo Account</Text>
                  </View>
                  {commissionSummary.records.map(({ payment, commission }) => (
                    <View key={payment.id} style={styles.tableRow}>
                      <View style={styles.customerCol}>
                        <Text style={styles.primary}>{displayValue(payment.customerName)}</Text>
                        {commission?.notificationMessage && (
                          <Text style={styles.warning}>{commission.notificationMessage}</Text>
                        )}
                      </View>
                      <View style={styles.phoneCol}>
                        <Text style={styles.cell}>{displayValue(payment.customerPhone)}</Text>
                        <Text style={styles.muted}>{displayValue(payment.receipt)}</Text>
                      </View>
                      <Text style={[styles.cell, styles.chassisCol]}>{displayValue(identifierForPayment(payment))}</Text>
                      <Text style={[styles.cellStrong, styles.moneyCol]}>{displayMoney(payment.totalPayable)}</Text>
                      <Text style={[styles.cellStrong, styles.moneyCol]}>{formatPercent(commission?.paymentPercentage)}</Text>
                      <Text style={[styles.cellStrong, styles.moneyCol]}>{formatPercent((commission?.commissionRate || 0) * 100)}</Text>
                      <Text style={[styles.cellStrong, styles.moneyCol]}>{formatKes(commission?.amount || 0)}</Text>
                      <Text style={[styles.cellStrong, styles.moneyCol]}>{displayMoney(payment.dailyTarget)}</Text>
                      <Text style={[styles.cellStrong, styles.moneyCol]}>{displayMoney(payment.balance)}</Text>
                      <Text style={[styles.cell, styles.dateCol]}>{displayDate(payment.date)}</Text>
                      <View style={styles.agentCol}>
                        <Text style={styles.cell}>{displayValue(payment.agentName)}</Text>
                        <Text style={styles.muted}>{displayAgentCode(payment)}</Text>
                      </View>
                      <View style={styles.statusCol}><StatusPill status={payment.status} /></View>
                      <View style={styles.statusCol}><StatusPill status={payment.paygoState} /></View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No payments found</Text>
              <Text style={styles.emptyText}>Check the agent name and agent ID, then try again.</Text>
            </View>
          )}
        </Section>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 18 },
  lookupForm: { padding: 14, gap: 10 },
  recordsActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
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
  tableScroll: { width: '100%' },
  tableScrollContent: { minWidth: '100%', flexGrow: 1, paddingLeft: 1 },
  table: { width: '100%', minWidth: 1510, flexGrow: 1 },
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
  primary: { fontWeight: '500' },
  muted: { color: 'var(--app-muted)', fontSize: 12, marginTop: 3 },
  cell: { color: 'var(--app-muted)', fontSize: 13, fontWeight: '500' },
  cellStrong: { fontWeight: '500' },
  warning: { color: '#b45309', fontSize: 11, marginTop: 4 },
  commissionSummary: { padding: 14, borderBottomWidth: 1, borderBottomColor: 'var(--app-border)', flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  summaryItem: { minWidth: 220 },
  summaryValue: { fontSize: 20, fontWeight: '500', marginTop: 4 },
  emptyState: { padding: 18 },
  emptyTitle: { fontSize: 15, fontWeight: '500' },
  emptyText: { color: 'var(--app-muted)', marginTop: 4 }
});

