import { signToken } from '../server/src/auth/jwt.ts';

const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';

function bearer(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

/**
 * Seed a VERIFIED certification for `workerId` in `category` through the real API
 * (the worker submits, an admin verifies), so credential-gated matching lets that
 * worker take that category's jobs. Not a test file (no `.test` suffix), so the
 * runner won't execute it directly.
 */
export async function seedVerifiedCertification(baseUrl, workerId, category) {
  const submit = await fetch(`${baseUrl}/certifications`, {
    method: 'POST',
    headers: bearer(workerId, 'worker'),
    body: JSON.stringify({
      category,
      title: `${category} license`,
      documentUrl: 'https://cdn.example.com/certs/seed.pdf',
    }),
  });
  const cert = await submit.json();
  await fetch(`${baseUrl}/certifications/${cert.id}/review`, {
    method: 'POST',
    headers: bearer(ADMIN_ID, 'admin'),
    body: JSON.stringify({ decision: 'verify' }),
  });
  return cert.id;
}
