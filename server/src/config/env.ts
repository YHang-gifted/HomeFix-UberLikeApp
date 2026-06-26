import process from 'node:process';

import { z } from 'zod';

/**
 * The dev-only fallback JWT secret. Safe for local development, but it is in the
 * public source tree, so any token signed with it is forgeable. Production must
 * override `JWT_SECRET`; `loadEnv` refuses to boot in production otherwise
 * (SEC-0004).
 */
export const DEV_JWT_SECRET = 'dev-insecure-secret-change-me-please';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    JWT_SECRET: z.string().min(16).default(DEV_JWT_SECRET),
    JWT_EXPIRES_IN: z.coerce.number().int().positive().default(604800),
    // Comma-separated allowlist of web origins permitted to call the API from a
    // browser. Empty (the default) keeps the permissive dev behavior (`*`);
    // production should set this to the known web origin(s). See SEC-0002.
    CORS_ALLOWED_ORIGINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      ),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.JWT_SECRET === DEV_JWT_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET must be set to a strong, non-default value in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return result.data;
}
