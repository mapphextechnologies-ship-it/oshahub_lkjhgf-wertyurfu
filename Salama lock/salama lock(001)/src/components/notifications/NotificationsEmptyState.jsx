import React from 'react';
import { Bell } from 'lucide-react';
import { View } from 'react-native';
import { colors } from '../../theme/colors.js';
import { Text } from '../ui/Text.jsx';
import { notificationStyles as styles } from './notificationStyles.js';

export function NotificationsEmptyState() {
  return (
    <View style={styles.emptyState}>
      <Bell size={22} color={colors.muted} />
      <Text style={styles.emptyTitle}>No notifications yet</Text>
      <Text style={styles.emptyText}>When sent, you will see them here.</Text>
    </View>
  );
}
