import { AlertTriangle, Banknote, Clock3, CreditCard, ServerCrash } from 'lucide-react';
import { colors } from '../../theme/colors.js';
import { formatDate } from '../../utils/dates.js';

const activityMeta = {
  payment_unpaid: {
    label: 'Payment',
    tone: colors.danger,
    soft: colors.dangerSoft,
    icon: AlertTriangle,
    action: 'Follow up with customer'
  },
  payment_daily: {
    label: 'Daily payment',
    tone: colors.primary,
    soft: colors.primarySoft,
    icon: CreditCard,
    action: 'Review paid and unpaid payment records'
  },
  repayment_health: {
    label: 'Repayment watch',
    tone: colors.warning,
    soft: colors.warningSoft,
    icon: AlertTriangle,
    action: 'Review customers slipping behind the daily amount'
  },
  overdue: {
    label: 'Overdue',
    tone: colors.warning,
    soft: colors.warningSoft,
    icon: Clock3,
    action: 'Review repayment plan'
  },
  commission: {
    label: 'Commission',
    tone: colors.success,
    soft: colors.successSoft,
    icon: Banknote,
    action: 'Open finance review'
  },
  integration: {
    label: 'Integration',
    tone: colors.danger,
    soft: colors.dangerSoft,
    icon: ServerCrash,
    action: 'Check agent portal sync'
  }
};

export function getActivityMeta(type) {
  return activityMeta[type] || activityMeta.payment_unpaid;
}

export function groupNotifications(items) {
  return items.reduce((groups, item) => {
    const label = formatDate(item.createdAt);
    const existing = groups.find((group) => group.label === label);

    if (existing) {
      existing.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }

    return groups;
  }, []);
}

export function shouldShowNotification(notification) {
  if (notification.type !== 'overdue') {
    return true;
  }

  return Number(notification.overdueDays || 0) >= 0;
}

export function formatNotificationDateTime(value) {
  return new Intl.DateTimeFormat('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}
