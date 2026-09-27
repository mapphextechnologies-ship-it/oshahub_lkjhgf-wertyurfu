import React from 'react';
import { RefreshCcw } from 'lucide-react';
import { StyleSheet, View } from 'react-native';
import { Button } from './ui/Button.jsx';
import { Text } from './ui/Text.jsx';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    this.setState({ hasError: true });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.root}>
        <View style={styles.panel}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            The portal could not render this view. Reload the app to start a clean session.
          </Text>
          <Button icon={RefreshCcw} onPress={() => window.location.reload()}>
            Reload portal
          </Button>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    minHeight: '100vh',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'var(--app-bg)'
  },
  panel: {
    width: '100%',
    maxWidth: 460,
    gap: 14,
    padding: 22,
    borderWidth: 1,
    borderColor: 'var(--app-border)',
    borderRadius: 10,
    backgroundColor: 'var(--app-surface)'
  },
  title: {
    fontSize: 22,
    fontWeight: '600'
  },
  message: {
    color: 'var(--app-muted)',
    lineHeight: 21
  }
});
