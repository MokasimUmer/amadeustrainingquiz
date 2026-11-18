import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

/**
 * Admin-password gate.  Checks the `Authorization: Bearer <password>` header.
 * When ADMIN_PASSWORD is empty (dev default) the middleware is skipped.
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  if (!config.adminPassword) {
    next();
    return;
  }

  const header = req.headers['authorization'] ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  let valid = false;
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(config.adminPassword);
    valid = a.length === b.length && timingSafeEqual(a, b);
  } catch {
    valid = false;
  }

  if (!valid) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
