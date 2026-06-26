import { type ReactElement, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { RegisterFieldErrors } from '../../../app/src/features/auth/registerForm';
import { validateRegisterForm } from '../../../app/src/features/auth/registerForm';
import type { RegisterRole } from '../../../app/src/features/auth/registerAction';
import { performRegister } from '../../../app/src/features/auth/registerAction';
import { apiClient } from '../api';

const ROLES: { value: RegisterRole; label: string }[] = [
  { value: 'customer', label: 'I need repairs' },
  { value: 'worker', label: 'I do repairs' },
];

export interface RegisterScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Called with the JWT after a successful sign-up. */
  onSuccess?: (token: string) => void;
  /** Called when the user wants to go back to the sign-in screen. */
  onBackToLogin?: () => void;
}

export function RegisterScreen({
  client,
  onSuccess,
  onBackToLogin,
}: RegisterScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<RegisterRole>('customer');
  const [errors, setErrors] = useState<RegisterFieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(): Promise<void> {
    setBanner(null);
    const fieldErrors = validateRegisterForm({ email, password, displayName });
    setErrors(fieldErrors);
    if (
      fieldErrors.email !== undefined ||
      fieldErrors.password !== undefined ||
      fieldErrors.displayName !== undefined
    ) {
      return;
    }

    setSubmitting(true);
    const outcome = await performRegister(activeClient, {
      email,
      password,
      displayName: displayName.trim(),
      role,
    });
    setSubmitting(false);

    if (outcome.ok) {
      onSuccess?.(outcome.token);
      return;
    }
    setBanner(outcome.message);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create your account</Text>
      <Text style={styles.subtitle}>Join HomeFix</Text>

      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Your name"
        accessibilityLabel="Name"
        editable={!submitting}
      />
      {errors.displayName !== undefined && <Text style={styles.error}>{errors.displayName}</Text>}

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
        placeholder="At least 8 characters"
        accessibilityLabel="Password"
        editable={!submitting}
      />
      {errors.password !== undefined && <Text style={styles.error}>{errors.password}</Text>}

      <Text style={styles.label}>I am a…</Text>
      <View style={styles.roleRow}>
        {ROLES.map((option) => {
          const selected = role === option.value;
          return (
            <Pressable
              key={option.value}
              style={[styles.role, selected && styles.roleSelected]}
              onPress={() => {
                setRole(option.value);
              }}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
            >
              <Text style={[styles.roleText, selected && styles.roleTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={({ pressed }) => [styles.button, (pressed || submitting) && styles.buttonPressed]}
        onPress={() => {
          void submit();
        }}
        disabled={submitting}
        accessibilityRole="button"
        accessibilityLabel="Create account"
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>Create account</Text>
        )}
      </Pressable>

      {banner !== null && <Text style={styles.banner}>{banner}</Text>}

      <Pressable
        style={styles.linkButton}
        onPress={() => {
          onBackToLogin?.();
        }}
        disabled={submitting}
        accessibilityRole="button"
        accessibilityLabel="Back to sign in"
      >
        <Text style={styles.link}>Already have an account? Sign in</Text>
      </Pressable>
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
  title: { fontSize: 28, fontWeight: '700', color: '#0f172a' },
  subtitle: { fontSize: 16, color: '#64748b', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#334155', marginTop: 12, marginBottom: 4 },
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
  roleRow: { flexDirection: 'row', gap: 10 },
  role: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  roleSelected: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  roleText: { fontSize: 14, color: '#334155', fontWeight: '600' },
  roleTextSelected: { color: '#2563eb' },
  button: {
    marginTop: 24,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonPressed: { backgroundColor: '#1d4ed8' },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  banner: { marginTop: 16, textAlign: 'center', fontSize: 14, color: '#dc2626' },
  linkButton: { marginTop: 20, alignItems: 'center' },
  link: { color: '#2563eb', fontSize: 14, fontWeight: '600' },
});
