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
import type {
  CreateRequestFieldErrors,
  CreateRequestFormValues,
} from '../../../app/src/features/serviceRequests/createRequestForm';
import { validateCreateRequestForm } from '../../../app/src/features/serviceRequests/createRequestForm';
import type { ServiceCategory, ServiceRequest } from '../../../shared/schemas';
import { serviceCategorySchema } from '../../../shared/schemas';
import { apiClient } from '../api';

const CATEGORIES = serviceCategorySchema.options;

export interface CreateRequestScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Called with the created request after a successful submit. */
  onCreated?: (request: ServiceRequest) => void;
}

export function CreateRequestScreen({ client, onCreated }: CreateRequestScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [errors, setErrors] = useState<CreateRequestFieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(): Promise<void> {
    setBanner(null);

    const values: CreateRequestFormValues = { category, description, latitude, longitude };
    const fieldErrors = validateCreateRequestForm(values);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) {
      return;
    }

    const principal = activeClient.getPrincipal();
    if (principal === null) {
      setBanner('Your session has expired. Please sign in again.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await activeClient.createServiceRequest({
        customerId: principal.id,
        category: category as ServiceCategory,
        description: description.trim(),
        location: { latitude: Number(latitude), longitude: Number(longitude) },
      });
      setBanner('Request created');
      onCreated?.(created);
    } catch (error) {
      setBanner(
        isApiError(error) ? error.message : 'Could not reach the server. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Category</Text>
      <View style={styles.chips}>
        {CATEGORIES.map((option) => {
          const selected = option === category;
          return (
            <Pressable
              key={option}
              onPress={() => {
                setCategory(option);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Category ${option}`}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
      {errors.category !== undefined && <Text style={styles.error}>{errors.category}</Text>}

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Describe the problem"
        accessibilityLabel="Description"
        multiline
        editable={!submitting}
      />
      {errors.description !== undefined && <Text style={styles.error}>{errors.description}</Text>}

      <Text style={styles.label}>Latitude</Text>
      <TextInput
        style={styles.input}
        value={latitude}
        onChangeText={setLatitude}
        placeholder="25.03"
        keyboardType="numbers-and-punctuation"
        accessibilityLabel="Latitude"
        editable={!submitting}
      />
      {errors.latitude !== undefined && <Text style={styles.error}>{errors.latitude}</Text>}

      <Text style={styles.label}>Longitude</Text>
      <TextInput
        style={styles.input}
        value={longitude}
        onChangeText={setLongitude}
        placeholder="121.56"
        keyboardType="numbers-and-punctuation"
        accessibilityLabel="Longitude"
        editable={!submitting}
      />
      {errors.longitude !== undefined && <Text style={styles.error}>{errors.longitude}</Text>}

      <Pressable
        style={({ pressed }) => [styles.button, (pressed || submitting) && styles.buttonPressed]}
        onPress={() => {
          void submit();
        }}
        disabled={submitting}
        accessibilityRole="button"
        accessibilityLabel="Create request"
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>Create request</Text>
        )}
      </Pressable>

      {banner !== null && <Text style={styles.banner}>{banner}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24 },
  label: { fontSize: 14, fontWeight: '600', color: '#334155', marginTop: 12, marginBottom: 6 },
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
  error: { color: '#dc2626', fontSize: 13, marginTop: 4 },
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
  banner: { marginTop: 16, textAlign: 'center', fontSize: 14, color: '#0f172a' },
});
