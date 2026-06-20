/**
 * Typed application error. Anything thrown that is an AppError is turned into a
 * clean JSON response by the central error handler; everything else becomes a
 * generic 500 (details hidden from the client, logged server-side).
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, message: string, opts?: { code?: string; details?: unknown }) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = opts?.code ?? defaultCode(status);
    this.details = opts?.details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

function defaultCode(status: number): string {
  switch (status) {
    case 400:
      return 'bad_request';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 422:
      return 'unprocessable';
    case 429:
      return 'rate_limited';
    default:
      return status >= 500 ? 'internal_error' : 'error';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, message, { code: 'bad_request', details });
export const unauthorized = (message = 'Unauthorized') =>
  new AppError(401, message, { code: 'unauthorized' });
export const forbidden = (message = 'Forbidden') =>
  new AppError(403, message, { code: 'forbidden' });
export const notFound = (message = 'Not found') =>
  new AppError(404, message, { code: 'not_found' });
export const conflict = (message: string, details?: unknown) =>
  new AppError(409, message, { code: 'conflict', details });

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
