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
import {
  parseScheduledTime,
  validateCreateRequestForm,
} from '../../../app/src/features/serviceRequests/createRequestForm';
import type { LocationProvider } from '../../../app/src/features/location/currentLocation';
import { fetchCurrentLocation } from '../../../app/src/features/location/currentLocation';
import type { GeocodeResult, Geocoder } from '../../../app/src/features/location/geocoding';
import {
  resultToCoordinateStrings,
  searchAddress,
} from '../../../app/src/features/location/geocoding';
import type { ServiceCategory, ServiceRequest } from '../../../shared/schemas';
import { serviceCategorySchema } from '../../../shared/schemas';
import { apiClient } from '../api';

const CATEGORIES = serviceCategorySchema.options;

export interface CreateRequestScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Called with the created request after a successful submit. */
  onCreated?: (request: ServiceRequest) => void;
  /**
   * Source of the device's current location. When provided, a "Use my current
   * location" button is shown. App.tsx injects the real expo-location provider;
   * left undefined (e.g. in tests or on web) the button is simply hidden.
   */
  locationProvider?: LocationProvider;
  /**
   * Address→coordinates lookup. When provided, an address-search field is shown.
   * Left undefined (e.g. in tests without a geocoder) the field is hidden.
   */
  geocoder?: Geocoder;
}

export function CreateRequestScreen({
  client,
  onCreated,
  locationProvider,
  geocoder,
}: CreateRequestScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [photoUrlsText, setPhotoUrlsText] = useState('');
  const [scheduledText, setScheduledText] = useState('');
  const [scheduledError, setScheduledError] = useState<string | null>(null);
  const [errors, setErrors] = useState<CreateRequestFieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [addressQuery, setAddressQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [addressResults, setAddressResults] = useState<GeocodeResult[]>([]);
  const [addressError, setAddressError] = useState<string | null>(null);

  async function searchForAddress(): Promise<void> {
    if (geocoder === undefined) {
      return;
    }
    setAddressError(null);
    setSearching(true);
    const outcome = await searchAddress(geocoder, addressQuery);
    setSearching(false);
    if (outcome.ok) {
      setAddressResults(outcome.results);
    } else {
      setAddressResults([]);
      setAddressError(outcome.message);
    }
  }

  function chooseAddress(result: GeocodeResult): void {
    const coords = resultToCoordinateStrings(result);
    setLatitude(coords.latitude);
    setLongitude(coords.longitude);
    setErrors((current) => ({ ...current, latitude: undefined, longitude: undefined }));
    setAddressResults([]);
    setAddressError(null);
    setAddressQuery(result.label);
  }

  async function fillCurrentLocation(): Promise<void> {
    if (locationProvider === undefined) {
      return;
    }
    setBanner(null);
    setLocating(true);
    const outcome = await fetchCurrentLocation(locationProvider);
    setLocating(false);
    if (outcome.ok) {
      setLatitude(outcome.latitude);
      setLongitude(outcome.longitude);
      setErrors((current) => ({ ...current, latitude: undefined, longitude: undefined }));
    } else {
      setBanner(outcome.message);
    }
  }

  async function submit(): Promise<void> {
    setBanner(null);

    const values: CreateRequestFormValues = { category, description, latitude, longitude };
    const fieldErrors = validateCreateRequestForm(values);
    setErrors(fieldErrors);

    const schedule = parseScheduledTime(scheduledText);
    setScheduledError(schedule.ok ? null : 'Enter a valid date/time (e.g. 2026-07-01T09:00)');

    if (Object.keys(fieldErrors).length > 0 || !schedule.ok) {
      return;
    }

    const principal = activeClient.getPrincipal();
    if (principal === null) {
      setBanner('Your session has expired. Please sign in again.');
      return;
    }

    const photoUrls = photoUrlsText
      .split(/[\n,]/)
      .map((url) => url.trim())
      .filter((url) => url.length > 0);

    setSubmitting(true);
    try {
      const created = await activeClient.createServiceRequest({
        customerId: principal.id,
        category: category as ServiceCategory,
        description: description.trim(),
        location: { latitude: Number(latitude), longitude: Number(longitude) },
        ...(photoUrls.length > 0 ? { photoUrls } : {}),
        ...(schedule.iso !== undefined ? { scheduledAt: schedule.iso } : {}),
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

      {geocoder !== undefined && (
        <>
          <Text style={styles.label}>Search address</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.input, styles.searchInput]}
              value={addressQuery}
              onChangeText={setAddressQuery}
              placeholder="e.g. Taipei 101"
              accessibilityLabel="Address search"
              autoCorrect={false}
              editable={!submitting && !searching}
            />
            <Pressable
              style={({ pressed }) => [
                styles.searchButton,
                pressed && styles.locationButtonPressed,
              ]}
              onPress={() => {
                void searchForAddress();
              }}
              disabled={submitting || searching}
              accessibilityRole="button"
              accessibilityLabel="Search address"
            >
              {searching ? (
                <ActivityIndicator color="#2563eb" />
              ) : (
                <Text style={styles.locationButtonText}>Search</Text>
              )}
            </Pressable>
          </View>
          {addressError !== null && <Text style={styles.error}>{addressError}</Text>}
          {addressResults.map((result) => (
            <Pressable
              key={`${result.label}:${result.latitude},${result.longitude}`}
              style={({ pressed }) => [styles.resultRow, pressed && styles.locationButtonPressed]}
              onPress={() => {
                chooseAddress(result);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Use ${result.label}`}
            >
              <Text style={styles.resultText}>{result.label}</Text>
            </Pressable>
          ))}
        </>
      )}

      {locationProvider !== undefined && (
        <Pressable
          style={({ pressed }) => [
            styles.locationButton,
            (pressed || locating) && styles.locationButtonPressed,
          ]}
          onPress={() => {
            void fillCurrentLocation();
          }}
          disabled={submitting || locating}
          accessibilityRole="button"
          accessibilityLabel="Use my current location"
        >
          {locating ? (
            <ActivityIndicator color="#2563eb" />
          ) : (
            <Text style={styles.locationButtonText}>Use my current location</Text>
          )}
        </Pressable>
      )}

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

      <Text style={styles.label}>Photo URLs</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={photoUrlsText}
        onChangeText={setPhotoUrlsText}
        placeholder="One URL per line (optional, up to 5)"
        accessibilityLabel="Photo URLs"
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        editable={!submitting}
      />

      <Text style={styles.label}>Preferred time</Text>
      <TextInput
        style={styles.input}
        value={scheduledText}
        onChangeText={setScheduledText}
        placeholder="Optional, e.g. 2026-07-01T09:00"
        accessibilityLabel="Preferred time"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!submitting}
      />
      {scheduledError !== null && <Text style={styles.error}>{scheduledError}</Text>}

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
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchInput: { flex: 1 },
  searchButton: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 80,
  },
  resultRow: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  resultText: { fontSize: 14, color: '#0f172a' },
  locationButton: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  locationButtonPressed: { backgroundColor: '#eff6ff' },
  locationButtonText: { color: '#2563eb', fontSize: 15, fontWeight: '600' },
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
