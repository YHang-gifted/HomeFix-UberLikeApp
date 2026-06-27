import { serviceCategorySchema } from '../../../../shared/schemas.ts';

export interface CreateRequestFormValues {
  category: string;
  description: string;
  latitude: string;
  longitude: string;
}

export interface CreateRequestFieldErrors {
  category?: string;
  description?: string;
  latitude?: string;
  longitude?: string;
}

function isCoordinate(value: string, min: number, max: number): boolean {
  const trimmed = value.trim();
  if (trimmed === '') {
    return false;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max;
}

export function validateCreateRequestForm(
  values: CreateRequestFormValues,
): CreateRequestFieldErrors {
  const errors: CreateRequestFieldErrors = {};

  if (!serviceCategorySchema.safeParse(values.category).success) {
    errors.category = 'Choose a valid category';
  }

  const description = values.description.trim();
  if (description.length === 0) {
    errors.description = 'Description is required';
  } else if (description.length > 2000) {
    errors.description = 'Description is too long (2000 characters max)';
  }

  if (!isCoordinate(values.latitude, -90, 90)) {
    errors.latitude = 'Enter a latitude between -90 and 90';
  }

  if (!isCoordinate(values.longitude, -180, 180)) {
    errors.longitude = 'Enter a longitude between -180 and 180';
  }

  return errors;
}

/**
 * Parse the optional "preferred time" field. An empty value is valid and means
 * "no preference" (`iso` undefined); a parseable date is converted to an ISO
 * string for the API; anything else is rejected so the screen can show an error.
 */
export type ScheduledTimeResult = { ok: true; iso: string | undefined } | { ok: false };

export function parseScheduledTime(input: string): ScheduledTimeResult {
  const trimmed = input.trim();
  if (trimmed === '') {
    return { ok: true, iso: undefined };
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return { ok: false };
  }
  return { ok: true, iso: date.toISOString() };
}
