import { Component, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Preview/production builds have no red-box or Metro connection to show a
 * crashing error — an uncaught render error just closes the app with no
 * diagnostic trail. This renders the error message and stack on screen
 * instead, so a screenshot is enough to actually diagnose a crash rather
 * than guessing at the cause build after build.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>TerraQuest spadl</Text>
          <Text style={styles.message}>{error.name}: {error.message}</Text>
          {error.stack ? <Text style={styles.stack}>{error.stack}</Text> : null}
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#3D0A0A', paddingTop: 56 },
  content: { padding: 20, gap: 12 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  message: { color: '#FFD1D1', fontSize: 14, lineHeight: 20 },
  stack: { color: '#FFB3B3', fontSize: 10, lineHeight: 14 },
});
