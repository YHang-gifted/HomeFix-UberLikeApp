import type { Request, Response } from 'express';

import { listCatalog } from '../services/catalogService.ts';

/** The fixed-price catalog of standardized tasks. Same for every signed-in user. */
export function getCatalog(_req: Request, res: Response): void {
  res.status(200).json({ items: listCatalog() });
}
