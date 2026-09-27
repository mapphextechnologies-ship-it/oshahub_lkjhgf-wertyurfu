import React from 'react';
import { View } from 'react-native';
import { Text } from '../ui/Text.jsx';
import { notificationStyles as styles } from './notificationStyles.js';

export function NotificationDetail({ notification, meta }) {
  const accountDetails = [
    ['Amount', notification.amount],
    ['Balance', notification.balance],
    ['Daily amount', notification.dailyAmount],
    ['Repayment health', notification.repaymentHealth],
    ['Overdue days', notification.overdueDays ? `${notification.overdueDays} days` : null]
  ].filter((detail) => detail[1]);

  const commissionDetails = [
    ['Commission earned', notification.commissionAmount],
    ['Commission type', notification.commissionType],
    ['Payout status', notification.payoutStatus]
  ].filter((detail) => detail[1]);

  const agentDetails = [
    ['Assigned agent', notification.agentName],
    ['Agent number', notification.agentNumber],
    ['Agent code', notification.agentCode]
  ].filter((detail) => detail[1]);

  const dailyPaymentDetails = [
    ['Date', notification.paymentDate],
    ['Records', notification.recordCount],
    ['Status', notification.paymentStatusSummary],
    ['Collected', notification.collectedAmount],
    ['Unpaid balance', notification.unpaidBalance]
  ].filter((detail) => detail[1] !== null && detail[1] !== undefined && detail[1] !== '');

  const dailyCustomerDetails = [
    ...(notification.customerActivities || []).map((activity) => [activity.label, activity.value])
  ].filter((detail) => detail[1] !== null && detail[1] !== undefined && detail[1] !== '');

  const dailyAgentDetails = [
    ['Agents / codes', notification.agentSummary]
  ].filter((detail) => detail[1] !== null && detail[1] !== undefined && detail[1] !== '');

  return (
    <View style={styles.detailBox}>
      <View style={styles.detailHeader}>
        <Text style={styles.detailLabel}>What is going on</Text>
        <Text style={[styles.detailStatus, { color: meta.tone }]}>
          {notification.sourcePortal || meta.label}
        </Text>
      </View>
      <Text style={styles.detailMessage}>{notification.issue || notification.message}</Text>

      <View style={styles.detailTable}>
        {notification.customerName && (
          <>
            <TableHeader title="Customer" />
            <TableRow label="Name" value={notification.customerName} />
            {notification.customerPhone && <TableRow label="Phone" value={notification.customerPhone} />}
            {notification.totalPayable && (
              <TableRow label="Total to pay" value={notification.totalPayable} />
            )}
            {notification.paidAmount && (
              <TableRow label="Paid so far" value={notification.paidAmount} />
            )}
          </>
        )}

        {accountDetails.length > 0 && (
          <>
            <TableHeader title="Payment details" />
            {accountDetails.map(([label, value]) => (
              <TableRow key={label} label={label} value={value} />
            ))}
          </>
        )}

        {commissionDetails.length > 0 && (
          <>
            <TableHeader title="Commission details" />
            {commissionDetails.map(([label, value]) => (
              <TableRow key={label} label={label} value={value} />
            ))}
          </>
        )}

        {agentDetails.length > 0 && (
          <>
            <TableHeader title="Agent details" />
            {agentDetails.map(([label, value]) => (
              <TableRow key={label} label={label} value={value} />
            ))}
          </>
        )}

        {dailyPaymentDetails.length > 0 && (
          <>
            <TableHeader title="Payment details" />
            {dailyPaymentDetails.map(([label, value]) => (
              <TableRow key={label} label={label} value={value} />
            ))}
          </>
        )}

        {dailyCustomerDetails.length > 0 && (
          <>
            <TableHeader title="Customer activity" />
            {dailyCustomerDetails.map(([label, value]) => (
              <TableRow key={label} label={label} value={value} />
            ))}
          </>
        )}

        {dailyAgentDetails.length > 0 && (
          <>
            <TableHeader title="Agent details" />
            {dailyAgentDetails.map(([label, value]) => (
              <TableRow key={label} label={label} value={value} />
            ))}
          </>
        )}
      </View>

      <View style={styles.followUpBox}>
        <Text style={styles.detailLabel}>Follow up needed</Text>
        <Text style={styles.detailValue}>{notification.followUp || meta.action}</Text>
      </View>
    </View>
  );
}

function TableHeader({ title }) {
  return (
    <View style={styles.tableHeaderRow}>
      <Text style={styles.detailSectionTitle}>{title}</Text>
    </View>
  );
}

function TableRow({ label, value }) {
  return (
    <View style={styles.tableRow}>
      <Text style={styles.tableLabel}>{label}</Text>
      <Text style={styles.tableValue}>{value}</Text>
    </View>
  );
}
