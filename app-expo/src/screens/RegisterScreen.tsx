import { type ReactElement, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { RegisterFieldErrors } from '../../../app/src/features/auth/registerForm';
import { validateRegisterForm } from '../../../app/src/features/auth/registerForm';
import type { RegisterRole } from '../../../app/src/features/auth/registerAction';
import { performRegister } from '../../../app/src/features/auth/registerAction';
import { apiClient } from '../api';
import { colors, radii, shadow, spacing } from '../theme';

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
      <View style={styles.shell}>
        <Text style={styles.eyebrow}>JOIN HOMEFIX</Text>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>One account for booking or doing local repairs.</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            accessibilityLabel="Name"
            editable={!submitting}
          />
          {errors.displayName !== undefined && (
            <Text style={styles.error}>{errors.displayName}</Text>
          )}

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
            style={({ pressed }) => [
              styles.button,
              (pressed || submitting) && styles.buttonPressed,
            ]}
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.canvas,
  },
  shell: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  eyebrow: { fontSize: 10, fontWeight: '800', color: colors.brand },
  title: { fontSize: 28, fontWeight: '800', color: colors.ink, marginTop: 2 },
  subtitle: { fontSize: 16, lineHeight: 24, color: colors.inkMuted, marginBottom: spacing.lg },
  form: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    padding: spacing.xl,
    ...shadow,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.canvas,
  },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.xs },
  roleRow: { flexDirection: 'row', gap: spacing.sm },
  role: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  roleSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  roleText: { fontSize: 14, color: colors.inkMuted, fontWeight: '700' },
  roleTextSelected: { color: colors.brand },
  button: {
    marginTop: spacing.xl,
    backgroundColor: colors.brand,
    borderRadius: radii.medium,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonPressed: { backgroundColor: colors.brandPressed },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  banner: { marginTop: spacing.lg, textAlign: 'center', fontSize: 14, color: colors.danger },
  linkButton: { marginTop: spacing.lg, alignItems: 'center', paddingVertical: spacing.sm },
  link: { color: colors.brand, fontSize: 14, fontWeight: '700' },
});
