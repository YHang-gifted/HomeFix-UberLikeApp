import { z } from 'zod';

export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .max(200, 'New password is too long'),
    confirmPassword: z.string().min(1, 'Please re-enter the new password'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;

export interface ChangePasswordFieldErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export function validateChangePasswordForm(values: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): ChangePasswordFieldErrors {
  const result = changePasswordFormSchema.safeParse(values);
  if (result.success) {
    return {};
  }

  const errors: ChangePasswordFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (field === 'currentPassword' && errors.currentPassword === undefined) {
      errors.currentPassword = issue.message;
    } else if (field === 'newPassword' && errors.newPassword === undefined) {
      errors.newPassword = issue.message;
    } else if (field === 'confirmPassword' && errors.confirmPassword === undefined) {
      errors.confirmPassword = issue.message;
    }
  }
  return errors;
}
