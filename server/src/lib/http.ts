import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { badRequest } from './errors';

/**
 * Wraps an async route handler so rejected promises are forwarded to Express's
 * error middleware instead of crashing the process / hanging the request.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Reads a required path parameter (guards against undefined under strict TS). */
export function getParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) throw badRequest(`Missing path parameter: ${name}`);
  return value;
}
