import { type ReactElement, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { LoginFieldErrors } from '../../../app/src/features/auth/loginForm';
import { validateLoginForm } from '../../../app/src/features/auth/loginForm';
import { performLogin } from '../../../app/src/features/auth/loginAction';
import { apiClient } from '../api';
import { colors, radii, shadow, spacing } from '../theme';

export interface LoginScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Called with the JWT after a successful login. */
  onSuccess?: (token: string) => void;
  /** Called when the user wants to create a new account. */
  onRegister?: () => void;
  /** Called when the user wants to reset a forgotten password. */
  onForgotPassword?: () => void;
}

export function LoginScreen({
  client,
  onSuccess,
  onRegister,
  onForgotPassword,
}: LoginScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

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
    const outcome = await performLogin(activeClient, email, password);
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
      <View style={styles.shell}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>HF</Text>
          </View>
          <View>
            <Text style={styles.title}>HomeFix</Text>
            <Text style={styles.eyebrow}>LOCAL REPAIR, DONE RIGHT</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          Welcome back. Sign in to manage your home or your workday.
        </Text>

        <View style={styles.form}>
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
            style={({ pressed }) => [
              styles.button,
              (pressed || submitting) && styles.buttonPressed,
            ]}
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

          <View style={styles.links}>
            <Pressable
              style={styles.linkButton}
              onPress={() => {
                onForgotPassword?.();
              }}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Forgot password"
            >
              <Text style={styles.link}>Forgot password?</Text>
            </Pressable>

            <Pressable
              style={styles.linkButton}
              onPress={() => {
                onRegister?.();
              }}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Create account"
            >
              <Text style={styles.link}>New to HomeFix? Create an account</Text>
            </Pressable>
          </View>
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
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: spacing.lg },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: radii.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  brandMarkText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  title: { fontSize: 30, fontWeight: '800', color: colors.ink },
  eyebrow: { fontSize: 10, fontWeight: '700', color: colors.brand, marginTop: 2 },
  subtitle: { fontSize: 16, lineHeight: 24, color: colors.inkMuted, marginBottom: spacing.xl },
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
  error: { color: colors.danger, fontSize: 13, marginTop: 4 },
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
  banner: { marginTop: spacing.lg, textAlign: 'center', fontSize: 14, color: colors.ink },
  links: { marginTop: spacing.lg, gap: 4 },
  linkButton: { paddingVertical: 8, alignItems: 'center' },
  link: { color: colors.brand, fontSize: 14, fontWeight: '700' },
});
