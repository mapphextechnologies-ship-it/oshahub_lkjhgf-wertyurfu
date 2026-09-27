import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors.js';
import { Text } from './Text.jsx';

export function Button({ children, onPress, variant = 'primary', icon: Icon, style, disabled = false }) {
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.primary : styles.secondary,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style
      ]}
    >
      {Icon && <Icon size={17} color={disabled ? colors.muted : isPrimary ? '#ffffff' : colors.primary} />}
      <Text style={[styles.label, { color: disabled ? colors.muted : isPrimary ? '#ffffff' : colors.primary }]}>
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 40,
    borderRadius: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    cursor: 'pointer',
    transitionDuration: '160ms',
    transitionProperty: 'transform, opacity, background-color, border-color',
    transitionTimingFunction: 'ease'
  },
  primary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  secondary: {
    backgroundColor: 'var(--app-surface)',
    borderColor: 'var(--app-border)'
  },
  label: {
    fontSize: 14,
    fontWeight: '500'
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }]
  },
  disabled: {
    opacity: 0.6,
    cursor: 'default'
  }
});
