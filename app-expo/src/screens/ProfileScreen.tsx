import { type ReactElement, useEffect, useMemo, useState } from 'react';
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
import type { UserProfile } from '../../../shared/schemas';
import { apiClient } from '../api';

export interface ProfileScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
}

export function ProfileScreen({ client }: ProfileScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const found = await activeClient.getMe();
        if (active) {
          setProfile(found);
          setName(found.displayName);
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
    setSaving(true);
    setMessage(null);
    try {
      const updated = await activeClient.updateProfile({ displayName: trimmed });
      setProfile(updated);
      setName(updated.displayName);
      setMessage('Saved');
    } catch (saveError) {
      setMessage(isApiError(saveError) ? saveError.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
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
});
