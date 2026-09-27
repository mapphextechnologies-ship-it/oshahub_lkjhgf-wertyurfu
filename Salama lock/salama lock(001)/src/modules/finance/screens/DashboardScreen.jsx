import React, { useEffect, useState } from 'react';
import { AlertTriangle, Bell, Bike, CreditCard, Download, Flag, HandCoins, RefreshCcw, Smartphone, Users } from 'lucide-react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button.jsx';
import { Section } from '@/components/ui/Section.jsx';
import { StatusPill } from '@/components/ui/StatusPill.jsx';
import { Text } from '@/components/ui/Text.jsx';
import { agentPortalService } from '@/services/agentPortalService.js';
import { commissionService } from '@/services/commissionService.js';
import { emptyDashboardSummary, financeService } from '@/services/financeService.js';
import { inventoryService } from '@/services/inventoryService.js';
import { paymentService } from '@/services/paymentService.js';
import { colors } from '@/theme/colors.js';
import { formatKes } from '@/utils/currency.js';
import { buildLastSevenDayCollectionTrend } from '@/utils/collectionTrend.js';
import { formatShortDate } from '@/utils/dates.js';
import { summarizeUnpaidCommissions } from '@/utils/commission.js';
import { downloadSpreadsheet } from '@/utils/spreadsheetExport.js';
import { matchesProductScope, normalizeProductScope } from '@/utils/productScope.js';

export function DashboardScreen({ onNavigate, notifications = [], productTypeScope = 'all' }) {
  const [payments, setPayments] = useState([]);
  const [dashboard, setDashboard] = useState({ summary: emptyDashboardSummary, trend: [] });
  const [commissions, setCommissions] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const scope = normalizeProductScope(productTypeScope);
  const scopedPayments = payments.filter((payment) => matchesProductScope(payment.productType || payment.product_type, scope));
  const scopedCustomers = customers.filter((customer) => matchesProductScope(customer.productType || customer.product_type, scope));
  const scopedProducts = products.filter((product) => matchesProductScope(product.productType || product.product_type, scope));
  const availableCollectionTrend = dashboard.trend.length > 0 ? dashboard.trend : buildTrendFromPayments(scopedPayments);
  const collectionTrend = buildLastSevenDayCollectionTrend(availableCollectionTrend);
  const maxAmount = Math.max(...collectionTrend.map((item) => item.amount), 1);
  const overdueCustomers = scopedCustomers.filter((customer) => Number(customer.overdueDays || 0) > 0);
  const latestAlerts = notifications.slice(0, 3);
  const phoneProducts = scopedProducts.filter((product) => matchesProductScope(product.productType || product.product_type, 'phone'));
  const bikeProducts = scopedProducts.filter((product) => matchesProductScope(product.productType || product.product_type, 'bike'));
  const soldProducts = scopedProducts.filter((product) => product.status === 'sold');
  const reservedProducts = scopedProducts.filter((product) => product.status === 'reserved');
  const soldPhones = soldProducts.filter((product) => matchesProductScope(product.productType || product.product_type, 'phone'));
  const soldBikes = soldProducts.filter((product) => matchesProductScope(product.productType || product.product_type, 'bike'));
  const reservedPhones = reservedProducts.filter((product) => matchesProductScope(product.productType || product.product_type, 'phone'));
  const reservedBikes = reservedProducts.filter((product) => matchesProductScope(product.productType || product.product_type, 'bike'));
  const liveCommissionSummary = commissions === null ? null : summarizeUnpaidCommissions(commissions);
  const bikeCommission = liveCommissionSummary
    ? liveCommissionSummary.bikeUnpaidCommissions
    : scope === 'bike'
      ? dashboard.summary.unpaidCommissions
      : dashboard.summary.bikeUnpaidCommissions;
  const phoneCommission = liveCommissionSummary
    ? liveCommissionSummary.phoneUnpaidCommissions
    : scope === 'phone'
      ? dashboard.summary.unpaidCommissions
      : dashboard.summary.phoneUnpaidCommissions;
  const totalCommission = liveCommissionSummary?.unpaidCommissions ?? dashboard.summary.unpaidCommissions;

  useEffect(() => {
    let mounted = true;
    const loadDashboardData = () => {
      const requestScope = scope || undefined;
      paymentService.listPayments({ productType: requestScope }).then((records) => mounted && setPayments(records)).catch(() => mounted && setPayments([]));
      financeService.getDashboard({ productType: requestScope }).then((data) => mounted && setDashboard(data)).catch(() => mounted && setDashboard({ summary: emptyDashboardSummary, trend: [] }));
      commissionService.listCommissions({ productType: requestScope }).then((records) => mounted && setCommissions(records)).catch(() => mounted && setCommissions(null));
      agentPortalService.listRegisteredCustomers().then((records) => mounted && setCustomers(records)).catch(() => mounted && setCustomers([]));
      inventoryService.listProducts({ productType: requestScope }).then((records) => mounted && setProducts(records)).catch(() => mounted && setProducts([]));
    };

    loadDashboardData();
    const timer = window.setInterval(loadDashboardData, 30000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [scope]);

  function exportDashboard() {
    const summaryRows = [
    ['Metric', 'Value'],
      ['Total collected', formatKes(dashboard.summary.totalCollected)],
      ['Expected collection', formatKes(dashboard.summary.expectedCollection)],
      ['Pending payments', formatKes(dashboard.summary.pendingPayments)],
      ['Overdue', formatKes(dashboard.summary.overdueAmount)],
      ['Reconciliation flags', dashboard.summary.reconciliationFlags],
      ['Total unpaid commission', formatKes(totalCommission)],
      ['Bike commission', formatKes(bikeCommission)],
      ['Phone commission', formatKes(phoneCommission)],
      ['Active accounts', dashboard.summary.activeAccounts],
      ['Today collections', dashboard.summary.todayCollections],
      ['Unpaid payments', dashboard.summary.unpaidPayments],
      ['Pending commissions', dashboard.summary.pendingCommissions]
    ];
    const trendRows = [
      ['Date', 'Amount', 'Transactions', 'Customers', 'Accounts'],
      ...collectionTrend.map((item) => [
        item.date,
        formatKes(item.amount),
        item.records || '',
        Array.isArray(item.customers) ? item.customers.join(', ') : '',
        Array.isArray(item.accounts) ? item.accounts.join(', ') : ''
      ])
    ];
    const recentPaymentRows = [
      ['Customer', 'Agent', 'Receipt', 'Daily target', 'Balance left', 'Paygo payment', 'Status'],
      ...payments.slice(0, 4).map((payment) => [
        payment.customerName,
        payment.agentName,
        payment.receipt,
        formatKes(payment.dailyTarget),
        formatKes(payment.balance),
        formatKes(Number(payment.paygoPayment || 0)),
        payment.status === 'paid' ? 'Paid' : 'Unpaid'
      ])
    ];
    const overdueRows = [
      ['Customer', 'Agent', 'Agent code', 'Overdue days', 'Balance'],
      ...overdueCustomers.map((customer) => [
        customer.customerName,
        customer.agentName,
        customer.agentId,
        customer.overdueDays,
        formatKes(customer.balance)
      ])
    ];

    downloadDashboardExcel({
      filename: `dashboard-export-${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheets: [
        { name: 'Summary', rows: summaryRows },
        { name: 'Collections trend', rows: trendRows },
        { name: 'Recent payments', rows: recentPaymentRows },
        { name: 'Overdue accounts', rows: overdueRows }
      ]
    }).catch(() => {
      window.alert('Dashboard export failed. Reload the app and try again.');
    });
  }

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <View>
          <View style={styles.activityLine}>
            <View style={styles.activityDot} />
            <Text style={styles.eyebrow}>Today activity</Text>
          </View>
        <Text style={styles.title}>Home</Text>
          <Text style={styles.subtitle}>
            {scope === 'phone' ? 'Phone collections, risk, commissions, and alerts.' : scope === 'bike' ? 'Bike collections, risk, commissions, and alerts.' : 'Collections, repayment risk, commissions, and alerts.'}
          </Text>
        </View>
        <Button icon={Download} variant="secondary" onPress={exportDashboard}>Export</Button>
      </View>

      <View style={styles.metricStrip}>
        <Metric label="Total collected" value={formatKes(dashboard.summary.totalCollected)} icon={CreditCard} tone="success" />
        <Metric label="Expected collection" value={formatKes(dashboard.summary.expectedCollection)} icon={Download} tone="violet" />
        <Metric label="Pending payments" value={formatKes(dashboard.summary.pendingPayments)} icon={Bell} tone="warning" />
        <Metric label="Overdue" value={formatKes(dashboard.summary.overdueAmount)} icon={AlertTriangle} tone="danger" />
        <Metric label="Reconciliation flags" value={dashboard.summary.reconciliationFlags} icon={RefreshCcw} tone="orange" />
        {scope ? (
          <Metric
            label={scope === 'phone' ? 'Phone commission' : 'Bike commission'}
            value={formatKes(scope === 'phone' ? phoneCommission : bikeCommission)}
            icon={scope === 'phone' ? Smartphone : Bike}
            tone="rose"
          />
        ) : (
          <>
            <Metric label="Total unpaid commission" value={formatKes(totalCommission)} icon={Flag} tone="rose" />
            <Metric label="Bike commission" value={formatKes(bikeCommission)} icon={Bike} tone="rose" />
            <Metric label="Phone commission" value={formatKes(phoneCommission)} icon={Smartphone} tone="rose" />
          </>
        )}
        <Metric label="Active accounts" value={dashboard.summary.activeAccounts} icon={Users} tone="teal" />
        <Metric label="Phones" value={phoneProducts.length} icon={CreditCard} tone="success" />
        <Metric label="Bikes" value={bikeProducts.length} icon={Bike} tone="warning" />
        <Metric label="Sold phones" value={soldPhones.length} icon={CreditCard} tone="success" />
        <Metric label="Sold bikes" value={soldBikes.length} icon={Bike} tone="warning" />
        <Metric label="Reserved phones" value={reservedPhones.length} icon={CreditCard} tone="success" />
        <Metric label="Reserved bikes" value={reservedBikes.length} icon={Bike} tone="warning" />
      </View>

      <View style={styles.grid}>
        <Section title="Collections trend" style={styles.largeSection}>
          <CollectionsLineChart trend={collectionTrend} maxAmount={maxAmount} />
        </Section>

        <Section
          title="Alerts"
          action={
            <Pressable onPress={() => onNavigate('notifications')}>
              <Text style={styles.link}>View all</Text>
            </Pressable>
          }
        >
          {latestAlerts.map((notification) => (
            <View key={notification.id} style={styles.alertRow}>
              <View style={styles.alertIcon}>
                <Bell size={16} color={notification.isRead ? colors.warning : colors.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{notification.title}</Text>
                <Text style={styles.rowMuted}>{notification.message}</Text>
              </View>
            </View>
          ))}
          {latestAlerts.length === 0 && (
            <View style={styles.alertRow}>
              <View style={styles.alertIcon}>
                <Bell size={16} color={colors.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>No alerts yet</Text>
                <Text style={styles.rowMuted}>New activity will appear here.</Text>
              </View>
            </View>
          )}
        </Section>
      </View>

      <View style={styles.grid}>
        <Section title="Recent payments" style={styles.largeSection}>
          {payments.slice(0, 4).map((payment) => (
            <View key={payment.id} style={styles.dataRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{payment.customerName}</Text>
                <Text style={styles.rowMuted}>{payment.agentName} | {payment.receipt}</Text>
                <Text style={styles.rowMuted}>
                  Daily target {formatKes(payment.dailyTarget)} | Balance left {formatKes(payment.balance)}
                </Text>
              </View>
              <Text style={styles.amount}>{formatKes(Number(payment.paygoPayment || 0))}</Text>
              <StatusPill status={payment.status} />
            </View>
          ))}
        </Section>

        <Section title="Overdue accounts">
          {overdueCustomers.map((customer) => (
            <View key={customer.id} style={styles.dataRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{customer.customerName}</Text>
                <Text style={styles.rowMuted}>{customer.agentName} | {customer.agentId}</Text>
                <Text style={styles.rowMuted}>{customer.overdueDays} days overdue</Text>
              </View>
              <Text style={styles.amount}>{formatKes(customer.balance)}</Text>
            </View>
          ))}
        </Section>
      </View>

      <Section title="Sold asset tracker">
        {soldProducts.slice(0, 5).map((product) => {
          const customer = customers.find((item) => item.id === product.assignedCustomerId);
          return (
            <View key={product.id} style={styles.dataRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{product.productModel || (String(product.productType || '').toLowerCase() === 'phone' ? 'Phone' : 'Bike')}</Text>
                <Text style={styles.rowMuted}>{product.serialNumber || product.chassisNumber || 'No serial'} | {customer?.customerName || customer?.name || 'Customer pending sync'}</Text>
                <Text style={styles.rowMuted}>Agent {product.assignedAgentCode || customer?.agentId || 'Not assigned'}</Text>
              </View>
              <StatusPill status="sold" />
            </View>
          );
        })}
        {soldProducts.length === 0 && (
          <View style={styles.dataRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>No sold assets yet</Text>
              <Text style={styles.rowMuted}>Approved assigned bikes will appear here for finance tracking.</Text>
            </View>
          </View>
        )}
      </Section>

      <View style={styles.quickActions}>
        <Button icon={CreditCard} onPress={() => onNavigate('payments')}>Review payments</Button>
        <Button icon={HandCoins} variant="secondary" onPress={() => onNavigate('commissions')}>Pay commissions</Button>
      </View>
    </View>
  );
}

async function downloadDashboardExcel({ filename, sheets }) {
  downloadSpreadsheet(filename, sheets);
}

function buildTrendFromPayments(payments) {
  const dailyCollections = payments.reduce((days, payment) => {
    const date = String(payment.date || '').slice(0, 10);
    if (!date) return days;

    const current = days.get(date) ?? {
      date,
      amount: 0,
      records: 0,
      customers: new Set(),
      accounts: new Set()
    };

    current.amount += Number(payment.depositCredit || 0) + Number(payment.paygoPayment || 0);
    current.records += 1;
    if (payment.customerName) current.customers.add(payment.customerName);
    if (payment.agentName || payment.agentId) current.accounts.add([payment.agentName, payment.agentId].filter(Boolean).join(' / '));
    days.set(date, current);
    return days;
  }, new Map());

  return [...dailyCollections.values()]
    .sort((first, second) => first.date.localeCompare(second.date))
    .map((item) => ({
      ...item,
      customers: [...item.customers],
      accounts: [...item.accounts]
    }));
}

const metricTones = {
  success: { soft: colors.successSoft, color: colors.success },
  violet: { soft: colors.violetSoft, color: colors.violet },
  warning: { soft: colors.warningSoft, color: colors.warning },
  orange: { soft: colors.orangeSoft, color: colors.orange },
  rose: { soft: colors.roseSoft, color: colors.rose },
  danger: { soft: colors.dangerSoft, color: colors.danger },
  teal: { soft: colors.tealSoft, color: colors.teal }
};

function Metric({ label, value, icon: Icon, tone }) {
  const selectedTone = metricTones[tone] ?? metricTones.violet;

  return (
    <View style={styles.metric}>
      <View style={[styles.metricIcon, { backgroundColor: selectedTone.soft }]}>
        <Icon size={19} color={selectedTone.color} />
      </View>
      <View style={{ minWidth: 0 }}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.metricValue}>{value}</Text>
      </View>
    </View>
  );
}

function CollectionsLineChart({ trend, maxAmount }) {
  const width = 620;
  const height = 240;
  const leftAxis = 82;
  const rightPadding = 24;
  const topPadding = 22;
  const bottomAxis = 44;
  const chartWidth = width - leftAxis - rightPadding;
  const chartHeight = height - topPadding - bottomAxis;
  const yMax = Math.ceil(maxAmount / 10000) * 10000 || 10000;
  const yTicks = [0, yMax * 0.5, yMax];
  const points = trend.map((item, index) => {
    const x = leftAxis + ((index + 1) / trend.length) * chartWidth;
    const y = topPadding + chartHeight - (Number(item.amount || 0) / yMax) * chartHeight;
    return { ...item, x, y };
  });
  const origin = { x: leftAxis, y: height - bottomAxis };
  const linePath = [
    `M ${origin.x} ${origin.y}`,
    ...points.map((point) => `L ${point.x} ${point.y}`)
  ].join(' ');

  if (points.length === 0) {
    return (
      <View style={styles.lineChartEmpty}>
        <Text style={styles.rowMuted}>No collection trend yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.lineChart}>
      <View style={styles.lineChartHeader}>
        <View>
          <Text style={styles.chartTitle}>Daily collections</Text>
          <Text style={styles.rowMuted}>Live customer-to-account collections from payment transactions</Text>
        </View>
        <Text style={styles.chartTotal}>
          {formatKes(trend.reduce((sum, item) => sum + Number(item.amount || 0), 0))}
        </Text>
      </View>
      <svg viewBox={`0 0 ${width} ${height}`} style={styles.lineChartSvg} role="img" aria-label="Collections trend x and y axis line graph">
        {[...yTicks].reverse().map((tick) => {
          const y = topPadding + chartHeight - (tick / yMax) * chartHeight;
          return (
            <g key={tick}>
              <line x1={leftAxis} x2={width - rightPadding} y1={y} y2={y} stroke="var(--app-border)" strokeWidth="1" />
              <text x={leftAxis - 10} y={y + 4} textAnchor="end" fill="var(--app-muted)" fontSize="11" fontWeight="600">
                {formatKes(Math.round(tick))}
              </text>
            </g>
          );
        })}
        <line x1={leftAxis} x2={leftAxis} y1={topPadding} y2={height - bottomAxis} stroke="var(--app-text)" strokeWidth="2" />
        <line x1={leftAxis} x2={width - rightPadding} y1={height - bottomAxis} y2={height - bottomAxis} stroke="var(--app-text)" strokeWidth="2" />
        <text x={18} y={height / 2} textAnchor="middle" fill="var(--app-muted)" fontSize="12" fontWeight="600" transform={`rotate(-90 18 ${height / 2})`}>
          Amount
        </text>
        <text x={(leftAxis + width - rightPadding) / 2} y={height - 4} textAnchor="middle" fill="var(--app-muted)" fontSize="12" fontWeight="600">
          Date
        </text>
        <path d={linePath} fill="none" stroke={colors.primary} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point) => (
          <g key={point.date}>
            <circle cx={point.x} cy={point.y} r="6" fill="#ffffff" stroke={colors.primary} strokeWidth="3" />
            <title>
              {[
                `${formatShortDate(point.date)}: ${formatKes(point.amount)}`,
                point.records ? `${point.records} transactions` : '',
                point.customers?.length ? `Customers: ${point.customers.join(', ')}` : '',
                point.accounts?.length ? `Accounts: ${point.accounts.join(', ')}` : ''
              ].filter(Boolean).join(' | ')}
            </title>
            <line x1={point.x} x2={point.x} y1={height - bottomAxis} y2={height - bottomAxis + 6} stroke="var(--app-text)" strokeWidth="2" />
            <text x={point.x} y={height - bottomAxis + 22} textAnchor="middle" fill="var(--app-muted)" fontSize="12" fontWeight="600">
              {formatShortDate(point.date)}
            </text>
            <text x={point.x} y={Math.max(point.y - 12, 14)} textAnchor="middle" fill={colors.primary} fontSize="12" fontWeight="700">
              {formatKes(point.amount)}
            </text>
          </g>
        ))}
      </svg>
      <View style={styles.chartLegend}>
        {points.map((point) => (
          <View key={point.date} style={styles.chartLegendItem}>
            <View style={styles.chartLegendDot} />
            <Text style={styles.chartLegendText}>{formatShortDate(point.date)}</Text>
            <Text style={styles.chartLegendAmount}>{formatKes(point.amount)}</Text>
          </View>
        ))}
      </View>
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
  metricStrip: { backgroundColor: 'var(--app-surface)', borderWidth: 1, borderColor: 'var(--app-border)', borderRadius: 8, flexDirection: 'row', flexWrap: 'wrap' },
  metric: { flex: 1, minWidth: 210, padding: 16, borderRightWidth: 1, borderRightColor: 'var(--app-border)', flexDirection: 'row', alignItems: 'center', gap: 12 },
  metricIcon: { width: 38, height: 38, borderRadius: 8, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { color: 'var(--app-muted)', fontSize: 12, fontWeight: '500' },
  metricValue: { fontSize: 21, fontWeight: '500', marginTop: 4 },
  grid: { flexDirection: 'row', gap: 18, flexWrap: 'wrap' },
  largeSection: { flex: 1.5, minWidth: 320 },
  lineChart: { padding: 14, gap: 10 },
  lineChartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  chartTitle: { fontWeight: '500' },
  chartTotal: { fontWeight: '500', color: colors.primary },
  lineChartSvg: { width: '100%', height: 230 },
  lineChartEmpty: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  chartLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chartLegendItem: {
    minHeight: 30,
    borderWidth: 1,
    borderColor: 'var(--app-border)',
    borderRadius: 6,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'var(--app-surface)'
  },
  chartLegendDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: colors.primary },
  chartLegendText: { color: 'var(--app-muted)', fontSize: 12, fontWeight: '500' },
  chartLegendAmount: { fontSize: 12, fontWeight: '500' },
  alertRow: { padding: 14, borderBottomWidth: 1, borderBottomColor: 'var(--app-border)', flexDirection: 'row', gap: 10 },
  alertIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.orangeSoft, alignItems: 'center', justifyContent: 'center' },
  dataRow: { padding: 14, borderBottomWidth: 1, borderBottomColor: 'var(--app-border)', flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { fontWeight: '500', fontSize: 14 },
  rowMuted: { color: 'var(--app-muted)', fontSize: 12, marginTop: 3 },
  amount: { fontWeight: '500' },
  link: { color: colors.primary, fontWeight: '500', fontSize: 13 },
  quickActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' }
});

