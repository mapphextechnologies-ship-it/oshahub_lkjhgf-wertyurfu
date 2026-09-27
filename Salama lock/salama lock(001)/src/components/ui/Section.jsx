import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../../theme/colors.js';
import { Text } from './Text.jsx';

export function Section({ title, action, children, style }) {
  return (
    <View style={[styles.section, style]}>
      {(title || action) && (
        <View style={styles.header}>
          {title && <Text style={styles.title}>{title}</Text>}
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: 'var(--app-surface)',
    borderWidth: 1,
    borderColor: 'var(--app-border)',
    borderRadius: 8,
    overflow: 'hidden'
  },
  header: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--app-border)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  title: {
    fontSize: 16,
    fontWeight: '500'
  }
});
