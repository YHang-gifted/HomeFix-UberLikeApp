import { z } from 'zod';

export const registerFormSchema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().trim().min(1, 'Name is required'),
});

export type RegisterFormValues = z.infer<typeof registerFormSchema>;

export interface RegisterFieldErrors {
  email?: string;
  password?: string;
  displayName?: string;
}

export function validateRegisterForm(values: {
  email: string;
  password: string;
  displayName: string;
}): RegisterFieldErrors {
  const result = registerFormSchema.safeParse(values);
  if (result.success) {
    return {};
  }

  const errors: RegisterFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (field === 'email' && errors.email === undefined) {
      errors.email = issue.message;
    } else if (field === 'password' && errors.password === undefined) {
      errors.password = issue.message;
    } else if (field === 'displayName' && errors.displayName === undefined) {
      errors.displayName = issue.message;
    }
  }
  return errors;
}
