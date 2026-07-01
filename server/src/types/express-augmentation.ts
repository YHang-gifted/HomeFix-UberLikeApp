import type { Buffer } from 'node:buffer';

import type { Principal } from '../../../shared/schemas.ts';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      principal?: Principal;
      /** Raw request body bytes, captured for webhook signature verification. */
      rawBody?: Buffer;
    }
  }
}

export {};
