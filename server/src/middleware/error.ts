import type { ErrorRequestHandler, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { isProd } from '../env';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    if (err.status >= 500) logger.error({ err, reqId: req.id }, err.message);
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details ?? undefined },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'validation_error', message: 'Validation failed', details: err.flatten() },
    });
    return;
  }

  const pgCode =
    err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined;

  // Unique-violation (e.g. one-approved-quotation-per-enquiry) → 409.
  if (pgCode === '23505') {
    res.status(409).json({ error: { code: 'conflict', message: 'Resource already exists' } });
    return;
  }

  // RAISE EXCEPTION from a trigger (e.g. the status-transition validator) → 400,
  // preserving the helpful message so the client shows the same guidance as before.
  if (pgCode === 'P0001') {
    res.status(400).json({
      error: { code: 'invalid_operation', message: (err as { message?: string }).message ?? 'Operation rejected' },
    });
    return;
  }

  // FK violation / not-null → 400 rather than a confusing 500.
  if (pgCode === '23503' || pgCode === '23502') {
    res.status(400).json({ error: { code: 'bad_request', message: 'Invalid or missing related record' } });
    return;
  }

  logger.error({ err, reqId: req.id }, 'Unhandled error');
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: isProd ? 'Internal server error' : String((err as Error)?.message ?? err),
    },
  });
};
