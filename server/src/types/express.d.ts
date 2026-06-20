import type { AuthContext } from '../middleware/auth';

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware on protected routes. */
      auth?: AuthContext;
      /** Request id (set by pino-http). */
      id?: string;
    }
  }
}

export {};
