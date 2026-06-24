import { type ReactElement } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

export interface LoadMoreFooterProps {
  /** Whether there are more items to load. */
  visible: boolean;
  /** Whether the next page is currently loading. */
  loading: boolean;
  onPress: () => void;
}

/** A "Load more" button rendered as a list footer, or nothing when there is no more. */
export function LoadMoreFooter({
  visible,
  loading,
  onPress,
}: LoadMoreFooterProps): ReactElement | null {
  if (!visible) {
    return null;
  }
  return (
    <Pressable
      style={({ pressed }) => [styles.loadMore, pressed && styles.loadMorePressed]}
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel="Load more"
    >
      {loading ? <ActivityIndicator /> : <Text style={styles.loadMoreText}>Load more</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loadMore: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  loadMorePressed: { opacity: 0.6 },
  loadMoreText: { color: '#2563eb', fontSize: 15, fontWeight: '600' },
});
