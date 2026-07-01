import { Buffer } from 'node:buffer';

import type { NextFunction, Request, Response } from 'express';

import { createUploadInputSchema, imageContentTypeSchema } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { requirePrincipal } from '../middlewares/auth.ts';
import { parseUuidParam } from './parseUuidParam.ts';
import { createUploadTarget, getUpload, storeUpload } from '../services/uploadService.ts';

/** Issue an upload target for an allowed image type. */
export async function postUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }
  const parsed = createUploadInputSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new AppError('Invalid upload request', 422));
    return;
  }
  try {
    res.status(200).json(await createUploadTarget(parsed.data));
  } catch (error) {
    next(error);
  }
}

/** Receive the uploaded image bytes (raw body parsed on the route). */
export function putUploadFile(req: Request, res: Response, next: NextFunction): void {
  const principal = requirePrincipal(req, next);
  if (!principal) {
    return;
  }
  const id = parseUuidParam(req, next, 'id', 'upload id');
  if (id === undefined) {
    return;
  }
  const contentType = imageContentTypeSchema.safeParse(req.header('content-type'));
  if (!contentType.success) {
    next(new AppError('Unsupported image type', 415));
    return;
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    next(new AppError('Empty upload', 400));
    return;
  }
  storeUpload(id, contentType.data, req.body);
  res.status(204).end();
}

/** Serve a stored image (public — no auth, so it can render in an <img>). */
export function getUploadFile(req: Request, res: Response, next: NextFunction): void {
  const id = parseUuidParam(req, next, 'id', 'upload id');
  if (id === undefined) {
    return;
  }
  try {
    const upload = getUpload(id);
    res.status(200).set('Content-Type', upload.contentType).send(upload.data);
  } catch (error) {
    next(error);
  }
}
