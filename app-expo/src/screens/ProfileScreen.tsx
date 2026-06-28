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
import type { ServiceCategory, UserProfile } from '../../../shared/schemas';
import { serviceCategorySchema } from '../../../shared/schemas';
import { apiClient } from '../api';

const CATEGORIES = serviceCategorySchema.options;

export interface ProfileScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
}

export function ProfileScreen({ client }: ProfileScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [skills, setSkills] = useState<ServiceCategory[]>([]);
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
          setPhone(found.phone ?? '');
          setBio(found.bio ?? '');
          setSkills(found.skills ?? []);
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
      });
      setProfile(updated);
      setName(updated.displayName);
      setPhone(updated.phone ?? '');
      setBio(updated.bio ?? '');
      setSkills(updated.skills ?? []);
      setMessage('Saved');
    } catch (saveError) {
      setMessage(isApiError(saveError) ? saveError.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function toggleSkill(category: ServiceCategory): void {
    setSkills((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
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
});
