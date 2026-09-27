import React from 'react';
import { Search } from 'lucide-react';
import { StyleSheet, TextInput, View } from 'react-native';
import { colors } from '../../theme/colors.js';

export function SearchInput({ value, onChangeText, placeholder = 'Search' }) {
  return (
    <View style={styles.wrap}>
      <Search size={17} color="var(--app-muted)" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="var(--app-muted)"
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: 'var(--app-border)',
    borderRadius: 8,
    backgroundColor: 'var(--app-surface)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    minWidth: 220
  },
  input: {
    outlineStyle: 'none',
    flex: 1,
    color: 'var(--app-text)',
    fontSize: 14
  }
});
