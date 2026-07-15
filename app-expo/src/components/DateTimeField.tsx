import { type ReactElement, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import type { OpenDateTimePicker } from '../../../app/src/features/schedule/dateTimePicker';
import { formatVisitTime } from '../../../app/src/features/schedule/dateTimePicker';
import { colors, radii } from '../theme';

export interface DateTimeFieldProps {
  /** The chosen time, or null when nothing is set yet. */
  value: Date | null;
  onChange: (value: Date) => void;
  /**
   * Opens the platform picker. Injected — this component never imports the native module, so it
   * stays renderable under jest with a fake `open`. App.tsx wires the real one.
   */
  open: OpenDateTimePicker;
  /** Earliest selectable time (the picker enforces it too; a future visit, typically now). */
  minimumDate?: Date;
  accessibilityLabel: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * A tap-to-pick date/time field. It shows the chosen time (or a placeholder) and, on press,
 * hands off to the injected picker — the OS calendar on a phone. It replaces the
 * `YYYY-MM-DD HH:MM` text box that people had to type by hand (and, in the schedule flow, both
 * parties had to type). On web the `.web.tsx` sibling renders a native `datetime-local` input
 * instead; both honour the same props.
 */
export function DateTimeField({
  value,
  onChange,
  open,
  minimumDate,
  accessibilityLabel,
  placeholder = 'Choose a date & time',
  disabled = false,
}: DateTimeFieldProps): ReactElement {
  const [busy, setBusy] = useState(false);

  async function pick(): Promise<void> {
    setBusy(true);
    try {
      const seed = value ?? seedFrom(minimumDate);
      const picked = await open(seed, minimumDate);
      if (picked !== null) {
        onChange(picked);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.field, (pressed || busy) && styles.fieldPressed]}
      onPress={() => {
        void pick();
      }}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {busy ? (
        <ActivityIndicator color={colors.brand} />
      ) : (
        <Text style={value === null ? styles.placeholder : styles.value}>
          {value === null ? placeholder : formatVisitTime(value)}
        </Text>
      )}
    </Pressable>
  );
}

/** Seed the picker at the minimum (a future time) when nothing is chosen, else now. */
function seedFrom(minimumDate?: Date): Date {
  const now = new Date();
  return minimumDate !== undefined && minimumDate.getTime() > now.getTime() ? minimumDate : now;
}

const styles = StyleSheet.create({
  field: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.small,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    minHeight: 44,
    justifyContent: 'center',
  },
  fieldPressed: { backgroundColor: colors.canvas },
  value: { fontSize: 16, color: colors.ink },
  placeholder: { fontSize: 16, color: colors.inkMuted },
});
