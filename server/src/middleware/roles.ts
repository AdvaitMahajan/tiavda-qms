import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { forbidden, unauthorized } from '../lib/errors';
import type { Role } from './auth';

/**
 * Role predicates mirror the database's RLS helpers exactly so the API enforces
 * the same permissions that RLS used to:
 *   is_editor()      -> super_admin | admin           (writes to quotations, payments, rate_matrix, settings)
 *   is_not_viewer()  -> anyone except viewer          (writes to enquiries, clients, follow_ups, etc.)
 */
export const isEditor = (role: Role): boolean => role === 'super_admin' || role === 'admin';
export const isNotViewer = (role: Role): boolean => role !== 'viewer';
export const isSuperAdmin = (role: Role): boolean => role === 'super_admin';

export function requireRole(...allowed: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!allowed.includes(req.auth.role)) {
      return next(forbidden(`Requires role: ${allowed.join(', ')}`));
    }
    next();
  };
}

export const requireEditor: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  if (!isEditor(req.auth.role)) return next(forbidden('Requires admin privileges'));
  next();
};

export const requireNotViewer: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  if (!isNotViewer(req.auth.role)) return next(forbidden('Viewers cannot perform this action'));
  next();
};

export const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  if (!isSuperAdmin(req.auth.role)) return next(forbidden('Requires super admin'));
  next();
};

/** Platform owner gate — for the cross-org /admin/* console routes. */
export const requirePlatformAdmin: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  if (!req.auth.isPlatformAdmin) return next(forbidden('Requires platform admin'));
  next();
};
