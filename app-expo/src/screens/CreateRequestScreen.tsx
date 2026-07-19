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
import type {
  CreateRequestFieldErrors,
  CreateRequestFormValues,
} from '../../../app/src/features/serviceRequests/createRequestForm';
import { validateCreateRequestForm } from '../../../app/src/features/serviceRequests/createRequestForm';
import type { OpenDateTimePicker } from '../../../app/src/features/schedule/dateTimePicker';
import type { LocationProvider } from '../../../app/src/features/location/currentLocation';
import {
  fetchCurrentLocation,
  toCoordinateStrings,
} from '../../../app/src/features/location/currentLocation';
import type { GeocodeResult, Geocoder } from '../../../app/src/features/location/geocoding';
import {
  resultToCoordinateStrings,
  searchAddress,
} from '../../../app/src/features/location/geocoding';
import type { MapPicker } from '../../../app/src/features/location/mapPicker';
import { initialMapRegion } from '../../../app/src/features/location/mapPicker';
import type { ImagePicker } from '../../../app/src/features/uploads/uploadImage';
import { uploadPickedImage } from '../../../app/src/features/uploads/uploadImage';
import { formatCents } from '../../../app/src/features/payments/paymentFormat';
import type { CatalogItem, ServiceCategory, ServiceRequest } from '../../../shared/schemas';
import { serviceCategorySchema } from '../../../shared/schemas';
import { apiClient } from '../api';
import { DateTimeField } from '../components/DateTimeField';

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
  /**
   * Device image picker. When provided, an "Add photo" button uploads a chosen
   * image and appends its public URL to the photo list. App.tsx injects the real
   * expo-image-picker; left undefined the button is hidden.
   */
  imagePicker?: ImagePicker;
  /**
   * Interactive map picker. When provided, a "Pick on map" button opens a map and
   * fills the coordinates from the dropped pin. App.tsx injects the real
   * react-native-maps picker; left undefined (tests/web) the button is hidden.
   */
  mapPicker?: MapPicker;
  /**
   * Opens the platform date/time picker for the preferred-visit field. App.tsx injects the
   * real one; tests pass a fake. Left undefined the field is a no-op (nothing to pick with).
   */
  openDateTimePicker?: OpenDateTimePicker;
}

export function CreateRequestScreen({
  client,
  onCreated,
  locationProvider,
  geocoder,
  imagePicker,
  mapPicker,
  openDateTimePicker,
}: CreateRequestScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogItemId, setCatalogItemId] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  // The human-readable address for the chosen location (from an address search).
  // Cleared whenever the coordinates are set some other way (manual edit, current
  // location, map pin), since those carry no address label.
  const [address, setAddress] = useState<string | null>(null);
  const [photoUrlsText, setPhotoUrlsText] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
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
    setAddress(result.label);
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
      setAddress(null);
      setErrors((current) => ({ ...current, latitude: undefined, longitude: undefined }));
    } else {
      setBanner(outcome.message);
    }
  }

  async function addPhoto(): Promise<void> {
    if (imagePicker === undefined) {
      return;
    }
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      const picked = await imagePicker();
      if (picked === null) {
        return;
      }
      const url = await uploadPickedImage(activeClient, picked);
      setPhotoUrlsText((current) => (current.trim() === '' ? url : `${current}\n${url}`));
    } catch {
      setPhotoError('Could not upload the photo. Please try again.');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function pickOnMap(): Promise<void> {
    if (mapPicker === undefined) {
      return;
    }
    const picked = await mapPicker(initialMapRegion(latitude, longitude));
    if (picked === null) {
      return;
    }
    const coords = toCoordinateStrings(picked);
    setLatitude(coords.latitude);
    setLongitude(coords.longitude);
    setAddress(null);
    setErrors((current) => ({ ...current, latitude: undefined, longitude: undefined }));
  }

  // The fixed-price catalog. Best-effort: if it can't be loaded the section is simply hidden and
  // the form behaves exactly as before (a normal quote-track request).
  useEffect(() => {
    let active = true;
    async function load(): Promise<void> {
      try {
        const items = await activeClient.listCatalog();
        if (active) {
          setCatalog(items);
        }
      } catch {
        // Leave the catalog hidden.
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [activeClient]);

  /**
   * Picking a standard job sets everything the platform already knows: its category (the server
   * takes it from the catalog too) and, when the customer hasn't typed anything yet, a starting
   * description. The price is fixed, so no quote step follows.
   */
  function selectCatalogItem(item: CatalogItem): void {
    setCatalogItemId(item.id);
    setCategory(item.category);
    setDescription((current) => (current.trim() === '' ? item.title : current));
  }

  function clearCatalogItem(): void {
    setCatalogItemId(null);
  }

  async function submit(): Promise<void> {
    setBanner(null);

    const values: CreateRequestFormValues = { category, description, latitude, longitude };
    const fieldErrors = validateCreateRequestForm(values);
    setErrors(fieldErrors);

    // The picker only yields valid future times, so there is nothing left to validate here —
    // the string parsing this used to do is gone.
    if (Object.keys(fieldErrors).length > 0) {
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
        ...(address !== null ? { address } : {}),
        ...(photoUrls.length > 0 ? { photoUrls } : {}),
        ...(scheduledAt !== null ? { scheduledAt: scheduledAt.toISOString() } : {}),
        // A standard job is priced by the platform: the server takes the price (and category)
        // from the catalog, so no worker quote step follows.
        ...(catalogItemId !== null ? { catalogItemId } : {}),
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
      {catalog.length > 0 && (
        <>
          <Text style={styles.label}>Standard jobs — fixed price</Text>
          <Text style={styles.catalogHint}>
            Pick one to book at a set price, or choose &quot;Something else&quot; to get quotes.
          </Text>
          {catalog.map((item) => {
            const selected = item.id === catalogItemId;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  selectCatalogItem(item);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Standard job ${item.title}`}
                style={[styles.catalogRow, selected && styles.catalogRowSelected]}
              >
                <Text style={[styles.catalogTitle, selected && styles.catalogTitleSelected]}>
                  {item.title}
                </Text>
                <Text style={[styles.catalogPrice, selected && styles.catalogTitleSelected]}>
                  {formatCents(item.priceCents)}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={clearCatalogItem}
            accessibilityRole="button"
            accessibilityLabel="Something else"
            style={[styles.catalogRow, catalogItemId === null && styles.catalogRowSelected]}
          >
            <Text
              style={[styles.catalogTitle, catalogItemId === null && styles.catalogTitleSelected]}
            >
              Something else — describe your job
            </Text>
          </Pressable>
        </>
      )}

      {catalogItemId === null && (
        <>
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
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {errors.category !== undefined && <Text style={styles.error}>{errors.category}</Text>}
        </>
      )}

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

      {mapPicker !== undefined && (
        <Pressable
          style={({ pressed }) => [styles.locationButton, pressed && styles.locationButtonPressed]}
          onPress={() => {
            void pickOnMap();
          }}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Pick on map"
        >
          <Text style={styles.locationButtonText}>Pick on map</Text>
        </Pressable>
      )}

      <Text style={styles.label}>Latitude</Text>
      <TextInput
        style={styles.input}
        value={latitude}
        onChangeText={(text) => {
          setLatitude(text);
          setAddress(null);
        }}
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
        onChangeText={(text) => {
          setLongitude(text);
          setAddress(null);
        }}
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
      {imagePicker !== undefined && (
        <Pressable
          style={({ pressed }) => [
            styles.locationButton,
            (pressed || photoBusy) && styles.locationButtonPressed,
          ]}
          onPress={() => {
            void addPhoto();
          }}
          disabled={photoBusy || submitting}
          accessibilityRole="button"
          accessibilityLabel="Add photo"
        >
          {photoBusy ? (
            <ActivityIndicator color="#2563eb" />
          ) : (
            <Text style={styles.locationButtonText}>Add photo from device</Text>
          )}
        </Pressable>
      )}
      {photoError !== null && <Text style={styles.error}>{photoError}</Text>}

      <Text style={styles.label}>Preferred time (optional)</Text>
      {openDateTimePicker !== undefined && (
        <DateTimeField
          value={scheduledAt}
          onChange={setScheduledAt}
          open={openDateTimePicker}
          minimumDate={new Date()}
          accessibilityLabel="Preferred time"
          placeholder="Choose a date & time"
          disabled={submitting}
        />
      )}

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
  catalogHint: { fontSize: 13, color: '#64748b', marginBottom: 8 },
  catalogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    minHeight: 44,
  },
  catalogRowSelected: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  catalogTitle: { fontSize: 15, color: '#0f172a', flexShrink: 1 },
  catalogTitleSelected: { color: '#2563eb', fontWeight: '700' },
  catalogPrice: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginLeft: 12 },
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
