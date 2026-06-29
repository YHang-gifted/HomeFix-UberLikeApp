import { z } from 'zod';

export const resetPasswordFormSchema = z
  .object({
    token: z.string().trim().min(1, 'Enter the reset code from your email'),
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

export type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>;

export interface ResetPasswordFieldErrors {
  token?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export function validateResetPasswordForm(values: {
  token: string;
  newPassword: string;
  confirmPassword: string;
}): ResetPasswordFieldErrors {
  const result = resetPasswordFormSchema.safeParse(values);
  if (result.success) {
    return {};
  }

  const errors: ResetPasswordFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (field === 'token' && errors.token === undefined) {
      errors.token = issue.message;
    } else if (field === 'newPassword' && errors.newPassword === undefined) {
      errors.newPassword = issue.message;
    } else if (field === 'confirmPassword' && errors.confirmPassword === undefined) {
      errors.confirmPassword = issue.message;
    }
  }
  return errors;
}
