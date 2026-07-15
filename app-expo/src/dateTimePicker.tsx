import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { OpenDateTimePicker } from '../../app/src/features/schedule/dateTimePicker';

/**
 * The real device date/time picker, backed by `@react-native-community/datetimepicker`.
 *
 * The two platforms need different shapes and this hides the difference behind one
 * {@link OpenDateTimePicker}:
 *
 * - **Android** has an *imperative* API (`DateTimePickerAndroid.open`), so no component needs to
 *   be mounted. Android also has no combined date+time dialog, so we open date, then time, and
 *   combine them — the flow a user expects.
 * - **iOS** only works as a *rendered* component, so it needs a host mounted at the app root
 *   (`DateTimePickerHost`, mirroring `MapPickerHost`). iOS does support a single `datetime`
 *   picker, so it is one step in a modal.
 *
 * Because this file (not `DateTimeField`) is where the native module is imported, and only
 * `App.tsx` imports this file, the screens and their jest tests never touch the native module —
 * they inject a fake `OpenDateTimePicker` instead.
 */

/** The iOS host registers its opener here while mounted; Android never uses it. */
let iosOpenHost: OpenDateTimePicker | null = null;

/** Android: open the date dialog, then the time dialog, then combine. Resolves null on cancel. */
function openAndroid(current: Date, minimumDate?: Date): Promise<Date | null> {
  return new Promise((resolve) => {
    DateTimePickerAndroid.open({
      value: current,
      mode: 'date',
      is24Hour: true,
      ...(minimumDate !== undefined ? { minimumDate } : {}),
      onChange: (dateEvent: DateTimePickerEvent, picked?: Date) => {
        if (dateEvent.type !== 'set' || picked === undefined) {
          resolve(null);
          return;
        }
        const day = picked;
        DateTimePickerAndroid.open({
          value: day,
          mode: 'time',
          is24Hour: true,
          onChange: (timeEvent: DateTimePickerEvent, pickedTime?: Date) => {
            if (timeEvent.type !== 'set' || pickedTime === undefined) {
              resolve(null);
              return;
            }
            const combined = new Date(day);
            combined.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
            resolve(combined);
          },
        });
      },
    });
  });
}

export const openDeviceDateTimePicker: OpenDateTimePicker = (current, minimumDate) =>
  Platform.OS === 'android'
    ? openAndroid(current, minimumDate)
    : (iosOpenHost?.(current, minimumDate) ?? Promise.resolve(null));

interface HostState {
  current: Date;
  minimumDate?: Date;
  resolve: (value: Date | null) => void;
}

/**
 * Mount once at the app root (like `MapPickerHost`). Renders the iOS picker modal on demand;
 * on Android it is inert (Android uses the imperative API above), so it returns null there.
 */
export function DateTimePickerHost(): ReactElement | null {
  const [state, setState] = useState<HostState | null>(null);

  const open = useCallback<OpenDateTimePicker>(
    (current, minimumDate) =>
      new Promise((resolve) => {
        setState({ current, resolve, ...(minimumDate !== undefined ? { minimumDate } : {}) });
      }),
    [],
  );

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return undefined;
    }
    iosOpenHost = open;
    return () => {
      iosOpenHost = null;
    };
  }, [open]);

  if (state === null) {
    return null;
  }

  function finish(value: Date | null): void {
    state?.resolve(value);
    setState(null);
  }

  return (
    <Modal
      transparent
      animationType="slide"
      visible
      onRequestClose={() => {
        finish(null);
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <DateTimePicker
            value={state.current}
            mode="datetime"
            display="inline"
            {...(state.minimumDate !== undefined ? { minimumDate: state.minimumDate } : {})}
            onChange={(_event: DateTimePickerEvent, picked?: Date) => {
              if (picked !== undefined) {
                setState((prev) => (prev === null ? prev : { ...prev, current: picked }));
              }
            }}
          />
          <View style={styles.actions}>
            <Pressable
              style={styles.cancel}
              onPress={() => {
                finish(null);
              }}
              accessibilityRole="button"
              accessibilityLabel="Cancel time selection"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={styles.confirm}
              onPress={() => {
                finish(state.current);
              }}
              accessibilityRole="button"
              accessibilityLabel="Confirm time selection"
            >
              <Text style={styles.confirmText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.35)' },
  sheet: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  actions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  cancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: { color: '#0f172a', fontSize: 15, fontWeight: '600' },
  confirm: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});
