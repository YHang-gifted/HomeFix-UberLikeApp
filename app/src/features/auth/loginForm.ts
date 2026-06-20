import { z } from 'zod';

export const loginFormSchema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;

export interface LoginFieldErrors {
  email?: string;
  password?: string;
}

export function validateLoginForm(values: { email: string; password: string }): LoginFieldErrors {
  const result = loginFormSchema.safeParse(values);
  if (result.success) {
    return {};
  }

  const errors: LoginFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (field === 'email' && errors.email === undefined) {
      errors.email = issue.message;
    } else if (field === 'password' && errors.password === undefined) {
      errors.password = issue.message;
    }
  }
  return errors;
}
