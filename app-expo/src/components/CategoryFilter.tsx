import { type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ServiceCategory } from '../../../shared/schemas';
import { serviceCategorySchema } from '../../../shared/schemas';
import { colors, radii } from '../theme';

const CATEGORIES = serviceCategorySchema.options;

export interface CategoryFilterProps {
  value: ServiceCategory | null;
  onChange: (category: ServiceCategory | null) => void;
}

export function CategoryFilter({ value, onChange }: CategoryFilterProps): ReactElement {
  // Wraps onto as many lines as the width needs, rather than scrolling off the right edge.
  // A horizontal scroll hid the later categories behind an edge with no affordance; on a phone
  // that read as "cut off". Wrapping shows every option at once.
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => {
          onChange(null);
        }}
        accessibilityRole="button"
        accessibilityLabel="Category all"
        style={[styles.chip, value === null && styles.chipSelected]}
      >
        <Text style={[styles.text, value === null && styles.textSelected]}>All</Text>
      </Pressable>
      {CATEGORIES.map((category) => (
        <Pressable
          key={category}
          onPress={() => {
            onChange(category);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Category ${category}`}
          style={[styles.chip, value === category && styles.chipSelected]}
        >
          <Text style={[styles.text, value === category && styles.textSelected]}>{category}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 6,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.small,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  text: { fontSize: 12, fontWeight: '600', color: colors.inkMuted, textTransform: 'capitalize' },
  textSelected: { color: colors.white },
});
