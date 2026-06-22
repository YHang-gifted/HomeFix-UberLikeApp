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
