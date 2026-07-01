import { type ReactElement, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import { isApiError } from '../../../app/src/services/apiClient';
import type { ChangePasswordFieldErrors } from '../../../app/src/features/auth/changePasswordForm';
import { validateChangePasswordForm } from '../../../app/src/features/auth/changePasswordForm';
import type { ServiceCategory, UserProfile, WorkerAvailability } from '../../../shared/schemas';
import { serviceCategorySchema, workerAvailabilitySchema } from '../../../shared/schemas';
import { apiClient } from '../api';

const CATEGORIES = serviceCategorySchema.options;
const AVAILABILITY_OPTIONS = workerAvailabilitySchema.options;

export interface ProfileScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /**
   * Called with the client's fresh token after change-password / logout-all so
   * the app can persist it (the server rotates the token on those actions).
   */
  onTokenRefreshed?: (token: string) => void | Promise<void>;
  /** Called after the account is deleted so the app can sign the user out. */
  onDeleted?: () => void | Promise<void>;
}

export function ProfileScreen({
  client,
  onTokenRefreshed,
  onDeleted,
}: ProfileScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [skills, setSkills] = useState<ServiceCategory[]>([]);
  const [availability, setAvailability] = useState<WorkerAvailability>('available');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyPush, setNotifyPush] = useState(true);
  const [notifyBusy, setNotifyBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwErrors, setPwErrors] = useState<ChangePasswordFieldErrors>({});
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState<string | null>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);

  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

  async function persistRefreshedToken(): Promise<void> {
    if (onTokenRefreshed === undefined) {
      return;
    }
    const token = activeClient.getToken();
    if (token !== undefined) {
      await onTokenRefreshed(token);
    }
  }

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const [found, prefs] = await Promise.all([
          activeClient.getMe(),
          activeClient.getNotificationPreferences(),
        ]);
        if (active) {
          setProfile(found);
          setName(found.displayName);
          setPhone(found.phone ?? '');
          setBio(found.bio ?? '');
          setSkills(found.skills ?? []);
          setAvailability(found.availability ?? 'available');
          setNotifyEmail(prefs.email);
          setNotifyPush(prefs.push);
          setError(null);
        }
      } catch {
        if (active) {
          setError('Could not load your profile.');
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [activeClient]);

  async function save(): Promise<void> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setMessage('Display name cannot be empty.');
      return;
    }
    const trimmedPhone = phone.trim();
    const trimmedBio = bio.trim();
    setSaving(true);
    setMessage(null);
    try {
      const updated = await activeClient.updateProfile({
        displayName: trimmed,
        phone: trimmedPhone === '' ? undefined : trimmedPhone,
        bio: trimmedBio === '' ? undefined : trimmedBio,
        skills: skills.length > 0 ? skills : undefined,
        availability: profile?.role === 'worker' ? availability : undefined,
      });
      setProfile(updated);
      setName(updated.displayName);
      setPhone(updated.phone ?? '');
      setBio(updated.bio ?? '');
      setSkills(updated.skills ?? []);
      setAvailability(updated.availability ?? 'available');
      setMessage('Saved');
    } catch (saveError) {
      setMessage(isApiError(saveError) ? saveError.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function submitPasswordChange(): Promise<void> {
    const fieldErrors = validateChangePasswordForm({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    setPwErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) {
      return;
    }
    setPwSaving(true);
    setPwMessage(null);
    try {
      await activeClient.changePassword(currentPassword, newPassword);
      await persistRefreshedToken();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwMessage('Password changed');
    } catch (changeError) {
      setPwMessage(isApiError(changeError) ? changeError.message : 'Could not change password.');
    } finally {
      setPwSaving(false);
    }
  }

  async function submitLogoutAll(): Promise<void> {
    setLogoutBusy(true);
    setPwMessage(null);
    try {
      await activeClient.logoutAll();
      await persistRefreshedToken();
      setPwMessage('Logged out of other devices');
    } catch (logoutError) {
      setPwMessage(
        isApiError(logoutError) ? logoutError.message : 'Could not log out other devices.',
      );
    } finally {
      setLogoutBusy(false);
    }
  }

  async function submitDelete(): Promise<void> {
    if (!deleteConfirmed) {
      setDeleteMessage('Please confirm you understand this is permanent.');
      return;
    }
    if (deletePassword.trim() === '') {
      setDeleteMessage('Enter your password to delete your account.');
      return;
    }
    setDeleteBusy(true);
    setDeleteMessage(null);
    try {
      await activeClient.deleteAccount(deletePassword);
      // The server has revoked every token; hand off to the app to sign out.
      await onDeleted?.();
    } catch (deleteError) {
      setDeleteMessage(
        isApiError(deleteError) ? deleteError.message : 'Could not delete your account.',
      );
      setDeleteBusy(false);
    }
  }

  function toggleSkill(category: ServiceCategory): void {
    setSkills((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  }

  async function toggleNotify(channel: 'email' | 'push', value: boolean): Promise<void> {
    const previousEmail = notifyEmail;
    const previousPush = notifyPush;
    // Optimistically reflect the switch, then confirm with the server.
    if (channel === 'email') {
      setNotifyEmail(value);
    } else {
      setNotifyPush(value);
    }
    setNotifyBusy(true);
    try {
      const input = channel === 'email' ? { email: value } : { push: value };
      const updated = await activeClient.updateNotificationPreferences(input);
      setNotifyEmail(updated.email);
      setNotifyPush(updated.push);
    } catch {
      setNotifyEmail(previousEmail);
      setNotifyPush(previousPush);
      setError('Could not update notification preferences.');
    } finally {
      setNotifyBusy(false);
    }
  }

  if (error !== null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (profile === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Email</Text>
      <Text style={styles.value}>{profile.email}</Text>

      <Text style={styles.label}>Role</Text>
      <Text style={styles.role}>{profile.role}</Text>

      <Text style={styles.label}>Display name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        accessibilityLabel="Display name"
        editable={!saving}
      />

      <Text style={styles.label}>Phone</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        accessibilityLabel="Phone"
        placeholder="Optional"
        keyboardType="phone-pad"
        editable={!saving}
      />

      {profile.role === 'worker' && (
        <>
          <Text style={styles.label}>Availability</Text>
          <View style={styles.chips}>
            {AVAILABILITY_OPTIONS.map((option) => {
              const selected = availability === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    setAvailability(option);
                  }}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel={`Set ${option}`}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={bio}
            onChangeText={setBio}
            accessibilityLabel="Bio"
            placeholder="Tell customers about your experience (optional)"
            multiline
            editable={!saving}
          />

          <Text style={styles.label}>Specialties</Text>
          <View style={styles.chips}>
            {CATEGORIES.map((category) => {
              const selected = skills.includes(category);
              return (
                <Pressable
                  key={category}
                  onPress={() => {
                    toggleSkill(category);
                  }}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel={`Specialty ${category}`}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {category}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <Pressable
        style={({ pressed }) => [styles.save, (pressed || saving) && styles.savePressed]}
        onPress={() => {
          void save();
        }}
        disabled={saving}
        accessibilityRole="button"
        accessibilityLabel="Save profile"
      >
        {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveText}>Save</Text>}
      </Pressable>

      {message !== null && <Text style={styles.message}>{message}</Text>}

      <Text style={styles.sectionHeader}>Notifications</Text>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Email notifications</Text>
        <Switch
          value={notifyEmail}
          onValueChange={(value) => {
            void toggleNotify('email', value);
          }}
          disabled={notifyBusy}
          accessibilityLabel="Email notifications"
        />
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Push notifications</Text>
        <Switch
          value={notifyPush}
          onValueChange={(value) => {
            void toggleNotify('push', value);
          }}
          disabled={notifyBusy}
          accessibilityLabel="Push notifications"
        />
      </View>

      <Text style={styles.sectionHeader}>Change password</Text>

      <Text style={styles.label}>Current password</Text>
      <TextInput
        style={styles.input}
        value={currentPassword}
        onChangeText={setCurrentPassword}
        accessibilityLabel="Current password"
        secureTextEntry
        editable={!pwSaving}
      />
      {pwErrors.currentPassword !== undefined && (
        <Text style={styles.fieldError}>{pwErrors.currentPassword}</Text>
      )}

      <Text style={styles.label}>New password</Text>
      <TextInput
        style={styles.input}
        value={newPassword}
        onChangeText={setNewPassword}
        accessibilityLabel="New password"
        secureTextEntry
        editable={!pwSaving}
      />
      {pwErrors.newPassword !== undefined && (
        <Text style={styles.fieldError}>{pwErrors.newPassword}</Text>
      )}

      <Text style={styles.label}>Confirm new password</Text>
      <TextInput
        style={styles.input}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        accessibilityLabel="Confirm new password"
        secureTextEntry
        editable={!pwSaving}
      />
      {pwErrors.confirmPassword !== undefined && (
        <Text style={styles.fieldError}>{pwErrors.confirmPassword}</Text>
      )}

      <Pressable
        style={({ pressed }) => [styles.save, (pressed || pwSaving) && styles.savePressed]}
        onPress={() => {
          void submitPasswordChange();
        }}
        disabled={pwSaving}
        accessibilityRole="button"
        accessibilityLabel="Change password"
      >
        {pwSaving ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.saveText}>Change password</Text>
        )}
      </Pressable>

      <Text style={styles.sectionHeader}>Devices</Text>
      <Text style={styles.hint}>
        Signs you out everywhere else by invalidating other devices’ sessions. This device stays
        signed in.
      </Text>
      <Pressable
        style={({ pressed }) => [styles.logout, (pressed || logoutBusy) && styles.logoutPressed]}
        onPress={() => {
          void submitLogoutAll();
        }}
        disabled={logoutBusy}
        accessibilityRole="button"
        accessibilityLabel="Log out other devices"
      >
        {logoutBusy ? (
          <ActivityIndicator color="#2563eb" />
        ) : (
          <Text style={styles.logoutText}>Log out other devices</Text>
        )}
      </Pressable>

      {pwMessage !== null && <Text style={styles.message}>{pwMessage}</Text>}

      <Text style={[styles.sectionHeader, styles.dangerHeader]}>Delete account</Text>
      <Text style={styles.hint}>
        Permanently deletes your account and removes your personal data. This cannot be undone.
      </Text>
      <Pressable
        style={styles.confirmRow}
        onPress={() => {
          setDeleteConfirmed((current) => !current);
        }}
        disabled={deleteBusy}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: deleteConfirmed }}
        accessibilityLabel="Confirm permanent deletion"
      >
        <View style={[styles.checkbox, deleteConfirmed && styles.checkboxChecked]}>
          {deleteConfirmed && <Text style={styles.checkboxMark}>✓</Text>}
        </View>
        <Text style={styles.confirmText}>I understand this is permanent.</Text>
      </Pressable>

      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        value={deletePassword}
        onChangeText={setDeletePassword}
        accessibilityLabel="Password to delete account"
        secureTextEntry
        editable={!deleteBusy}
      />

      <Pressable
        style={({ pressed }) => [styles.delete, (pressed || deleteBusy) && styles.deletePressed]}
        onPress={() => {
          void submitDelete();
        }}
        disabled={deleteBusy}
        accessibilityRole="button"
        accessibilityLabel="Delete account"
      >
        {deleteBusy ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.deleteText}>Delete account</Text>
        )}
      </Pressable>

      {deleteMessage !== null && <Text style={styles.message}>{deleteMessage}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#dc2626', fontSize: 15, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: '#64748b', marginTop: 20, marginBottom: 4 },
  value: { fontSize: 16, color: '#0f172a' },
  role: { fontSize: 16, color: '#2563eb', textTransform: 'capitalize' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#0f172a',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 14, color: '#334155', textTransform: 'capitalize' },
  chipTextSelected: { color: '#ffffff' },
  save: {
    marginTop: 24,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  savePressed: { backgroundColor: '#1d4ed8' },
  saveText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  message: { marginTop: 16, fontSize: 14, color: '#0f172a' },
  sectionHeader: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginTop: 32 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  switchLabel: { fontSize: 15, color: '#0f172a' },
  fieldError: { color: '#dc2626', fontSize: 13, marginTop: 4 },
  hint: { fontSize: 13, color: '#64748b', marginTop: 8, marginBottom: 12 },
  logout: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  logoutPressed: { backgroundColor: '#eff6ff' },
  logoutText: { color: '#2563eb', fontSize: 16, fontWeight: '600' },
  dangerHeader: { color: '#b91c1c' },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#b91c1c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#b91c1c' },
  checkboxMark: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  confirmText: { fontSize: 14, color: '#334155', flexShrink: 1 },
  delete: {
    marginTop: 16,
    backgroundColor: '#dc2626',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  deletePressed: { backgroundColor: '#b91c1c' },
  deleteText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
