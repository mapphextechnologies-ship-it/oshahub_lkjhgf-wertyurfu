import React from 'react';
import { Download } from 'lucide-react';
import { Pressable, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors.js';
import { Text } from './Text.jsx';

export function FloatingInstallButton({ visible, onPress, label = 'Install SALAMA LOCK app' }) {
  if (!visible) return null;

  return (
    <Pressable onPress={onPress} style={styles.button}>
      <Download size={18} color="#ffffff" />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'fixed',
    left: 18,
    bottom: 18,
    zIndex: 1000,
    minHeight: 46,
    maxWidth: 'calc(100vw - 36px)',
    borderRadius: 999,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primary,
    boxShadow: '0 14px 28px rgba(7, 87, 200, 0.28)',
    cursor: 'pointer'
  },
  label: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600'
  }
});
