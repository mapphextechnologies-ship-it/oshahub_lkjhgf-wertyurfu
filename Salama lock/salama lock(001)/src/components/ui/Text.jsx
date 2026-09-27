import React from 'react';
import { Text as RNText } from 'react-native';
import { colors } from '../../theme/colors.js';

export function Text({ children, style, ...props }) {
  return (
    <RNText
      {...props}
      style={[
        {
          color: 'var(--app-text)',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif'
        },
        style
      ]}
    >
      {children}
    </RNText>
  );
}
