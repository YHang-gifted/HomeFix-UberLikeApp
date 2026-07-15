import { type ReactElement } from 'react';

import type { OpenDateTimePicker } from '../../../app/src/features/schedule/dateTimePicker';
import {
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from '../../../app/src/features/schedule/dateTimePicker';

export interface DateTimeFieldProps {
  value: Date | null;
  onChange: (value: Date) => void;
  /** Present for prop parity with the native field; the browser input needs no opener. */
  open?: OpenDateTimePicker;
  minimumDate?: Date;
  accessibilityLabel: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * The web date/time field: a native `<input type="datetime-local">`, which every current
 * browser renders as its own calendar + clock. This file ships only to web, where the renderer
 * is react-dom, so a raw DOM element is exactly right (the same reason `mapPicker.web.tsx` talks
 * to the DOM directly). The native sibling uses the OS picker via an injected opener; both honour
 * the same props, so the screens are platform-agnostic.
 */
export function DateTimeField({
  value,
  onChange,
  minimumDate,
  accessibilityLabel,
  disabled = false,
}: DateTimeFieldProps): ReactElement {
  return (
    <input
      type="datetime-local"
      aria-label={accessibilityLabel}
      disabled={disabled}
      value={value === null ? '' : toDateTimeLocalValue(value)}
      min={minimumDate === undefined ? undefined : toDateTimeLocalValue(minimumDate)}
      onChange={(event) => {
        const parsed = fromDateTimeLocalValue(event.target.value);
        if (parsed !== null) {
          onChange(parsed);
        }
      }}
      style={{
        boxSizing: 'border-box',
        width: '100%',
        minHeight: 44,
        border: '1px solid #cbd5e1',
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 16,
        color: '#0f172a',
        backgroundColor: '#ffffff',
      }}
    />
  );
}
