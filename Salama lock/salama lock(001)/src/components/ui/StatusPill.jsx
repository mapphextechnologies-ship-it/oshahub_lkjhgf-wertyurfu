import React from 'react';
import { StyleSheet, View } from 'react-native';
import { getStatusTone, humanizeStatus } from '../../utils/status.js';
import { Text } from './Text.jsx';

export function StatusPill({ status }) {
  const tone = getStatusTone(status);

  return (
    <View style={[styles.pill, tone]}>
      <Text style={[styles.text, { color: tone.color }]}>{humanizeStatus(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  text: {
    fontSize: 11,
    fontWeight: '500'
  }
});
