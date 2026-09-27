import React from 'react';
import { ChevronDown, ChevronRight, Mail, MailOpen, X } from 'lucide-react';
import { Pressable, View } from 'react-native';
import { colors } from '../../theme/colors.js';
import { Text } from '../ui/Text.jsx';
import { NotificationDetail } from './NotificationDetail.jsx';
import { formatNotificationDateTime, getActivityMeta } from './notificationMeta.js';
import { notificationStyles as styles } from './notificationStyles.js';

export function NotificationActivityItem({
  notification,
  isOpen,
  onToggle,
  onClose,
  onToggleRead,
  onDismiss
}) {
  const meta = getActivityMeta(notification.type);
  const ActivityIcon = meta.icon;
  const RowIcon = isOpen ? ChevronDown : ChevronRight;

  return (
    <View style={styles.notificationItem}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          styles.row,
          !notification.isRead && styles.unread,
          pressed && styles.pressed
        ]}
      >
        <View style={[styles.icon, { backgroundColor: meta.soft }]}>
          <ActivityIcon size={18} color={meta.tone} />
        </View>
        <View style={styles.body}>
          <View style={styles.metaLine}>
            <View style={[styles.typePill, { backgroundColor: meta.soft }]}>
              <Text style={[styles.typeText, { color: meta.tone }]}>{meta.label}</Text>
            </View>
            {!notification.isRead && <View style={styles.dot} />}
          </View>
          <Text style={[styles.title, !notification.isRead && styles.unreadTitle]}>
            {notification.title}
          </Text>
          <Text style={styles.message}>{notification.message}</Text>
          <Text style={styles.dateTime}>{formatNotificationDateTime(notification.createdAt)}</Text>
        </View>
        <RowIcon size={18} color={colors.muted} />
      </Pressable>

      {isOpen && (
        <View style={styles.actionsPanel}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <NotificationDetail notification={notification} meta={meta} />
          </Pressable>
          <View style={styles.actionRow}>
            <Pressable
              accessibilityLabel={notification.isRead ? 'Mark unread' : 'Mark read'}
              style={styles.iconActionButton}
              onPress={onToggleRead}
            >
              {notification.isRead ? (
                <Mail size={16} color={colors.primary} />
              ) : (
                <MailOpen size={16} color={colors.primary} />
              )}
            </Pressable>
            <Pressable
              accessibilityLabel="Dismiss"
              style={[styles.iconActionButton, styles.dismissButton]}
              onPress={onDismiss}
            >
              <X size={16} color={colors.danger} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
