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
import type { ImagePicker } from '../../../app/src/features/uploads/uploadImage';
import { uploadPickedImage } from '../../../app/src/features/uploads/uploadImage';
import type { Certification, CertificationStatus, ServiceCategory } from '../../../shared/schemas';
import { serviceCategorySchema } from '../../../shared/schemas';
import { apiClient } from '../api';
import { colors, radii, shadow, spacing } from '../theme';

const CATEGORIES = serviceCategorySchema.options;

const STATUS_STYLE: Record<CertificationStatus, { label: string; bg: string; fg: string }> = {
  pending: { label: 'Pending review', bg: colors.goldSoft, fg: colors.gold },
  verified: { label: 'Verified', bg: colors.brandSoft, fg: colors.brand },
  rejected: { label: 'Rejected', bg: colors.dangerSoft, fg: colors.danger },
};

export interface CertificationsScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Picks a document image to upload as the certificate. Hidden when absent. */
  imagePicker?: ImagePicker;
  /** Bump this to force a reload (e.g. when the screen regains focus). */
  refreshToken?: number;
}

export function CertificationsScreen({
  client,
  imagePicker,
  refreshToken,
}: CertificationsScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [certifications, setCertifications] = useState<Certification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<ServiceCategory | null>(null);
  const [title, setTitle] = useState('');
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load(): Promise<void> {
      try {
        const found = await activeClient.listMyCertifications();
        if (active) {
          setCertifications(found);
          setError(null);
        }
      } catch {
        if (active) {
          setError('Could not load your certifications.');
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [activeClient, refreshToken]);

  async function uploadDocument(): Promise<void> {
    if (imagePicker === undefined) {
      return;
    }
    setFormMessage(null);
    setUploading(true);
    try {
      const picked = await imagePicker();
      if (picked === null) {
        return;
      }
      setDocumentUrl(await uploadPickedImage(activeClient, picked));
    } catch {
      setFormMessage('Could not upload the document. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function submit(): Promise<void> {
    const trimmedTitle = title.trim();
    if (category === null || trimmedTitle === '' || documentUrl === null) {
      setFormMessage('Choose a category, enter a title, and upload the certificate document.');
      return;
    }
    setSubmitting(true);
    setFormMessage(null);
    try {
      const created = await activeClient.submitCertification({
        category,
        title: trimmedTitle,
        documentUrl,
      });
      setCertifications((current) => [created, ...(current ?? [])]);
      setCategory(null);
      setTitle('');
      setDocumentUrl(null);
      setFormMessage('Submitted for review.');
    } catch (submitError) {
      setFormMessage(
        isApiError(submitError) ? submitError.message : 'Could not submit. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (error !== null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>WORKER CREDENTIALS</Text>
      <Text style={styles.heading}>Your certifications</Text>
      <Text style={styles.subheading}>
        Upload a certificate for each specialty. Once an admin verifies it, you can take jobs in
        that category.
      </Text>

      {certifications === null ? (
        <ActivityIndicator style={styles.loading} />
      ) : certifications.length === 0 ? (
        <Text style={styles.empty}>No certifications yet. Add one below.</Text>
      ) : (
        certifications.map((certification) => {
          const style = STATUS_STYLE[certification.status];
          return (
            <View key={certification.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{certification.title}</Text>
                <View style={[styles.pill, { backgroundColor: style.bg }]}>
                  <Text style={[styles.pillText, { color: style.fg }]}>{style.label}</Text>
                </View>
              </View>
              <Text style={styles.cardCategory}>{certification.category}</Text>
              {certification.rejectionReason !== undefined && (
                <Text style={styles.rejection}>Reason: {certification.rejectionReason}</Text>
              )}
            </View>
          );
        })
      )}

      <Text style={styles.formHeading}>Add a certification</Text>

      <Text style={styles.label}>Category</Text>
      <View style={styles.chips}>
        {CATEGORIES.map((option) => {
          const selected = category === option;
          return (
            <Pressable
              key={option}
              onPress={() => {
                setCategory(option);
              }}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel={`Category ${option}`}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Journeyman Electrician License"
        accessibilityLabel="Certification title"
        editable={!submitting}
      />

      {imagePicker !== undefined && (
        <Pressable
          style={({ pressed }) => [styles.uploadButton, pressed && styles.uploadPressed]}
          onPress={() => {
            void uploadDocument();
          }}
          disabled={uploading || submitting}
          accessibilityRole="button"
          accessibilityLabel="Upload document"
        >
          {uploading ? (
            <ActivityIndicator color={colors.brand} />
          ) : (
            <Text style={styles.uploadText}>
              {documentUrl === null ? 'Upload document' : 'Document attached ✓'}
            </Text>
          )}
        </Pressable>
      )}

      <Pressable
        style={({ pressed }) => [styles.submit, (pressed || submitting) && styles.submitPressed]}
        onPress={() => {
          void submit();
        }}
        disabled={submitting}
        accessibilityRole="button"
        accessibilityLabel="Submit certification"
      >
        {submitting ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.submitText}>Submit for review</Text>
        )}
      </Pressable>

      {formMessage !== null && <Text style={styles.message}>{formMessage}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.xl, width: '100%', maxWidth: 640, alignSelf: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  error: { color: colors.danger, fontSize: 15, textAlign: 'center' },
  eyebrow: { fontSize: 10, fontWeight: '800', color: colors.brand },
  heading: { fontSize: 24, fontWeight: '800', color: colors.ink, marginTop: 2 },
  subheading: { fontSize: 14, lineHeight: 20, color: colors.inkMuted, marginTop: 4 },
  loading: { marginTop: spacing.xl },
  empty: { color: colors.inkMuted, fontSize: 15, marginTop: spacing.xl },
  card: {
    marginTop: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    backgroundColor: colors.surface,
    ...shadow,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  cardCategory: { fontSize: 13, color: colors.inkMuted, textTransform: 'capitalize', marginTop: 4 },
  rejection: { fontSize: 13, color: colors.danger, marginTop: 6 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  formHeading: { fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: spacing.xxl },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.inkMuted,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 14, color: colors.ink, textTransform: 'capitalize' },
  chipTextSelected: { color: colors.white, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  uploadButton: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radii.medium,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  uploadPressed: { backgroundColor: colors.brandSoft },
  uploadText: { color: colors.brand, fontSize: 15, fontWeight: '700' },
  submit: {
    marginTop: spacing.lg,
    backgroundColor: colors.brand,
    borderRadius: radii.medium,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  submitPressed: { backgroundColor: colors.brandPressed },
  submitText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  message: { marginTop: spacing.md, fontSize: 14, color: colors.ink },
});
