import React, { useEffect, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button.jsx';
import { Section } from '@/components/ui/Section.jsx';
import { StatusPill } from '@/components/ui/StatusPill.jsx';
import { Text } from '@/components/ui/Text.jsx';
import { financeService } from '@/services/financeService.js';
import { colors } from '@/theme/colors.js';
import { formatKes } from '@/utils/currency.js';
import { formatDate } from '@/utils/dates.js';
import { normalizeProductScope } from '@/utils/productScope.js';
import { Header } from './PaymentsScreen.jsx';

export function ReconciliationScreen({ productTypeScope = 'all' }) {
  const [reconciliation, setReconciliation] = useState([]);
  const [checking, setChecking] = useState(false);
  const scope = normalizeProductScope(productTypeScope);

  function runCheck() {
    setChecking(true);
    financeService
      .getReconciliation({ productType: scope || undefined })
      .then(setReconciliation)
      .catch(() => setReconciliation([]))
      .finally(() => setChecking(false));
  }

  useEffect(() => {
    runCheck();
    const timer = window.setInterval(() => {
      financeService
        .getReconciliation({ productType: scope || undefined })
        .then(setReconciliation)
        .catch(() => null);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [scope]);

  return (
    <View style={styles.page}>
      <Header
        eyebrow="Review activity"
        title="Reconcile"
        subtitle={scope === 'phone' ? 'Match provider receipts with saved phone payment records.' : scope === 'bike' ? 'Match provider receipts with saved bike payment records.' : 'Match provider receipts with saved payment records.'}
        action={<Button icon={RefreshCcw} disabled={checking} onPress={runCheck}>{checking ? 'Checking' : 'Run check'}</Button>}
      />
      <Section title="Receipt comparison">
        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow]}>
            <Text style={[styles.headerText, styles.receiptCol]}>Receipt</Text>
            <Text style={[styles.headerText, styles.customerCol]}>Customer</Text>
            <Text style={[styles.headerText, styles.dateCol]}>Date</Text>
            <Text style={[styles.headerText, styles.nationalIdCol, styles.nationalIdOffset]}>National ID</Text>
            <Text style={[styles.headerText, styles.moneyCol]}>Provider</Text>
            <Text style={[styles.headerText, styles.moneyCol]}>Recorded</Text>
            <Text style={[styles.headerText, styles.statusCol]}>Status</Text>
          </View>
          {reconciliation.map((record) => (
            <View key={record.id} style={styles.row}>
              <Text style={[styles.receipt, styles.receiptCol]}>{record.receipt}</Text>
              <View style={styles.customerCol}>
                <Text style={styles.customer}>{record.customerName}</Text>
              </View>
              <Text style={[styles.meta, styles.dateCol]}>{formatDate(record.date)}</Text>
              <Text style={[styles.nationalId, styles.nationalIdCol, styles.nationalIdOffset]}>{record.nationalId}</Text>
              <Text style={[styles.amount, styles.moneyCol]}>{formatKes(record.providerAmount)}</Text>
              <Text style={[styles.amount, styles.moneyCol]}>{record.systemAmount ? formatKes(record.systemAmount) : 'Missing'}</Text>
              <View style={styles.statusCol}>
                <StatusPill status={record.status} />
              </View>
            </View>
          ))}
        </View>
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 18 },
  table: { padding: 12, overflowX: 'auto' },
  row: { minWidth: 1010, minHeight: 58, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: 'var(--app-border)', flexDirection: 'row', alignItems: 'center', gap: 16 },
  headerRow: { minHeight: 38, borderBottomWidth: 0, borderRadius: 8, backgroundColor: colors.successSoft },
  headerText: { color: colors.slate, fontSize: 12, fontWeight: '700' },
  receiptCol: { width: 150 },
  customerCol: { flex: 1.4, minWidth: 210 },
  dateCol: { width: 118 },
  nationalIdCol: { width: 126 },
  nationalIdOffset: { marginLeft: 18 },
  moneyCol: { width: 130, textAlign: 'right' },
  statusCol: { width: 128, alignItems: 'flex-end' },
  receipt: { fontWeight: '500' },
  customer: { fontWeight: '500' },
  meta: { color: 'var(--app-muted)', fontSize: 12, marginTop: 3 },
  nationalId: { color: colors.slate, fontSize: 12, fontWeight: '500' },
  amount: { color: 'var(--app-muted)', fontWeight: '500' }
});

