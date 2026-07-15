import type { OpenDateTimePicker } from '../../app/src/features/schedule/dateTimePicker';

/**
 * Web has no imperative picker and needs no host: `DateTimeField.web.tsx` renders a native
 * `<input type="datetime-local">` inline. These exports exist only so `App.tsx` can import the
 * same names on every platform. The opener is never called on web, and the host renders nothing.
 */
export const openDeviceDateTimePicker: OpenDateTimePicker = () => Promise.resolve(null);

export function DateTimePickerHost(): null {
  return null;
}
