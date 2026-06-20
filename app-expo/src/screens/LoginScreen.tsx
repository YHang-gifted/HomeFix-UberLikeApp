import { type ReactElement, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { LoginFieldErrors } from '../../../app/src/features/auth/loginForm';
import { validateLoginForm } from '../../../app/src/features/auth/loginForm';
import { performLogin } from '../../../app/src/features/auth/loginAction';
import { ApiClient } from '../../../app/src/services/apiClient';
import { API_BASE_URL } from '../config';

export interface LoginScreenProps {
  /** Optional client override (used by tests). Defaults to the real API client. */
  client?: ApiClient;
  /** Called with the JWT after a successful login. */
  onSuccess?: (token: string) => void;
}

export function LoginScreen({ client, onSuccess }: LoginScreenProps): ReactElement {
  const apiClient = useMemo(() => client ?? new ApiClient(API_BASE_URL), [client]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<LoginFieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(): Promise<void> {
    setBanner(null);

    const fieldErrors = validateLoginForm({ email, password });
    setErrors(fieldErrors);
    if (fieldErrors.email !== undefined || fieldErrors.password !== undefined) {
      return;
    }

    setSubmitting(true);
    const outcome = await performLogin(apiClient, email, password);
    setSubmitting(false);

    if (outcome.ok) {
      setBanner('Signed in');
      onSuccess?.(outcome.token);
      return;
    }
    setBanner(outcome.message);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>HomeFix</Text>
      <Text style={styles.subtitle}>Sign in to continue</Text>

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
        editable={!submitting}
      />
      {errors.email !== undefined && <Text style={styles.error}>{errors.email}</Text>}

      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="Your password"
        accessibilityLabel="Password"
        editable={!submitting}
      />
      {errors.password !== undefined && <Text style={styles.error}>{errors.password}</Text>}

      <Pressable
        style={({ pressed }) => [styles.button, (pressed || submitting) && styles.buttonPressed]}
        onPress={() => {
          void submit();
        }}
        disabled={submitting}
        accessibilityRole="button"
        accessibilityLabel="Sign in"
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>Sign in</Text>
        )}
      </Pressable>

      {banner !== null && <Text style={styles.banner}>{banner}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#0f172a',
  },
  error: {
    color: '#dc2626',
    fontSize: 13,
    marginTop: 4,
  },
  button: {
    marginTop: 24,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonPressed: {
    backgroundColor: '#1d4ed8',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  banner: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 14,
    color: '#0f172a',
  },
});
