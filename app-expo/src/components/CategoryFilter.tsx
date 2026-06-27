import { type ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import type { ServiceCategory } from '../../../shared/schemas';
import { serviceCategorySchema } from '../../../shared/schemas';

const CATEGORIES = serviceCategorySchema.options;

export interface CategoryFilterProps {
  value: ServiceCategory | null;
  onChange: (category: ServiceCategory | null) => void;
}

export function CategoryFilter({ value, onChange }: CategoryFilterProps): ReactElement {
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  text: { fontSize: 13, color: '#334155', textTransform: 'capitalize' },
  textSelected: { color: '#ffffff' },
});
