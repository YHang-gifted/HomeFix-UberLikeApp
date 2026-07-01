export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  public constructor(message: string, statusCode = 400, isOperational = true) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Structural guard for AppError. Avoids cross-module `instanceof`, which is
 * unreliable under tsx on Linux CI (the same .ts can load as two module
 * instances, so an AppError from one is not `instanceof` the class in another).
 */
export function isAppError(err: unknown): err is AppError {
  return (
    err instanceof AppError ||
    (typeof err === 'object' &&
      err !== null &&
      (err as { name?: unknown }).name === 'AppError' &&
      typeof (err as { statusCode?: unknown }).statusCode === 'number' &&
      typeof (err as { message?: unknown }).message === 'string')
  );
}
