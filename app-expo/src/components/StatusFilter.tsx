import { type ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import type { ServiceRequestStatus } from '../../../shared/schemas';
import { serviceRequestStatusSchema } from '../../../shared/schemas';
import { colors, radii } from '../theme';

const STATUSES = serviceRequestStatusSchema.options;

export interface StatusFilterProps {
  value: ServiceRequestStatus | null;
  onChange: (status: ServiceRequestStatus | null) => void;
}

export function StatusFilter({ value, onChange }: StatusFilterProps): ReactElement {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      <Pressable
        onPress={() => {
          onChange(null);
        }}
        accessibilityRole="button"
        accessibilityLabel="Filter all"
        style={[styles.chip, value === null && styles.chipSelected]}
      >
        <Text style={[styles.text, value === null && styles.textSelected]}>All</Text>
      </Pressable>
      {STATUSES.map((status) => (
        <Pressable
          key={status}
          onPress={() => {
            onChange(status);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Filter ${status}`}
          style={[styles.chip, value === status && styles.chipSelected]}
        >
          <Text style={[styles.text, value === status && styles.textSelected]}>
            {status.replace('_', ' ')}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { paddingHorizontal: 16, paddingBottom: 10, gap: 6 },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.small,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  text: { fontSize: 12, fontWeight: '600', color: colors.inkMuted, textTransform: 'capitalize' },
  textSelected: { color: colors.white },
});
