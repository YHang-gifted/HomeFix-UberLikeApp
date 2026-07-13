import { type ReactElement, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import { isApiError } from '../../../app/src/services/apiClient';
import type { ResetPasswordFieldErrors } from '../../../app/src/features/auth/resetPasswordForm';
import { validateResetPasswordForm } from '../../../app/src/features/auth/resetPasswordForm';
import { apiClient } from '../api';

export interface ForgotPasswordScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Called when the user is done (e.g. to return to the sign-in screen). */
  onDone?: () => void;
  /**
   * A reset token taken from the magic link (`/?reset=…`). When present the screen opens
   * straight at the new-password step with the code already filled in — the whole point of
   * the link is that the user never handles the code. Without it the screen behaves as before:
   * ask for an email, send a code, then accept it.
   */
  initialToken?: string;
}

export function ForgotPasswordScreen({
  client,
  onDone,
  initialToken,
}: ForgotPasswordScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const arrivedByLink = initialToken !== undefined && initialToken !== '';

  const [email, setEmail] = useState('');
  // Arriving by link means the code step is already reached — there is nothing left to request.
  const [requested, setRequested] = useState(arrivedByLink);
  const [token, setToken] = useState(initialToken ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<ResetPasswordFieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function sendCode(): Promise<void> {
    if (email.trim() === '') {
      setMessage('Enter your email.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await activeClient.forgotPassword(email.trim());
      setRequested(true);
      setMessage('If an account exists for that email, we sent a reset code.');
    } catch {
      setMessage('Could not send a reset code. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(): Promise<void> {
    const fieldErrors = validateResetPasswordForm({ token, newPassword, confirmPassword });
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await activeClient.resetPassword(token.trim(), newPassword);
      setDone(true);
      setMessage('Your password has been reset. Please sign in.');
    } catch (resetError) {
      setMessage(
        isApiError(resetError) && resetError.status === 400
          ? 'That reset code is invalid or has expired.'
          : 'Could not reset your password. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Reset password</Text>

      {/* Arrived from the emailed link: the code is already in hand, so asking for the email
          again would be asking the user to prove something the link just proved. Go straight
          to the new password. */}
      {!arrivedByLink && (
        <>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            accessibilityLabel="Email"
            editable={!busy && !done}
          />
          <Pressable
            style={({ pressed }) => [styles.button, (pressed || busy) && styles.buttonPressed]}
            onPress={() => {
              void sendCode();
            }}
            disabled={busy || done}
            accessibilityRole="button"
            accessibilityLabel="Send reset code"
          >
            {busy && !requested ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Send reset code</Text>
            )}
          </Pressable>
        </>
      )}

      {requested && !done && (
        <View>
          {arrivedByLink ? (
            <Text style={styles.message}>Choose a new password for your account.</Text>
          ) : (
            <>
              <Text style={styles.label}>Reset code</Text>
              <TextInput
                style={styles.input}
                value={token}
                onChangeText={setToken}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Code from your email"
                accessibilityLabel="Reset code"
                editable={!busy}
              />
            </>
          )}
          {errors.token !== undefined && <Text style={styles.error}>{errors.token}</Text>}

          <Text style={styles.label}>New password</Text>
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            accessibilityLabel="New password"
            editable={!busy}
          />
          {errors.newPassword !== undefined && (
            <Text style={styles.error}>{errors.newPassword}</Text>
          )}

          <Text style={styles.label}>Confirm new password</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            accessibilityLabel="Confirm new password"
            editable={!busy}
          />
          {errors.confirmPassword !== undefined && (
            <Text style={styles.error}>{errors.confirmPassword}</Text>
          )}

          <Pressable
            style={({ pressed }) => [styles.button, (pressed || busy) && styles.buttonPressed]}
            onPress={() => {
              void submitReset();
            }}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Reset password"
          >
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Reset password</Text>
            )}
          </Pressable>
        </View>
      )}

      {message !== null && <Text style={styles.message}>{message}</Text>}

      <Pressable
        style={styles.linkButton}
        onPress={() => {
          onDone?.();
        }}
        accessibilityRole="button"
        accessibilityLabel="Back to sign in"
      >
        <Text style={styles.link}>Back to sign in</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24 },
  title: { fontSize: 28, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  label: { fontSize: 14, fontWeight: '600', color: '#334155', marginTop: 16, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#0f172a',
  },
  error: { color: '#dc2626', fontSize: 13, marginTop: 4 },
  button: {
    marginTop: 20,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonPressed: { backgroundColor: '#1d4ed8' },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  message: { marginTop: 16, fontSize: 14, color: '#0f172a' },
  linkButton: { marginTop: 24, alignItems: 'center' },
  link: { color: '#2563eb', fontSize: 14, fontWeight: '600' },
});
