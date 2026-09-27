import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../../theme/colors.js';
import { Text } from './Text.jsx';

export function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(onClose, 3500);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <View style={styles.toast}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'fixed',
    left: '50%',
    bottom: 22,
    transform: [{ translateX: '-50%' }],
    minHeight: 24,
    maxWidth: '92vw',
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 80
  },
  text: {
    color: colors.success,
    fontSize: 14,
    fontWeight: '500'
  }
});
