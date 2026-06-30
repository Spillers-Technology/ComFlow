import { NextFunction, Request, Response } from 'express'
import { User } from '../../../shared/src/index.js'

/**
 * Restrict a route to the platform owner — the only identity that spans tenants
 * (tenant/plan management, billing config, global usage). Chain after
 * {@link requireAuth}. In open mode the synthetic identity is the owner, so
 * self-host/dev/tests pass through unchanged.
 */
export function requireOwner(
  _request: Request,
  response: Response,
  next: NextFunction
) {
  const user = response.locals.user as User | undefined
  if (!user || user.role !== 'owner') {
    response.status(403).json({ error: 'Platform owner access required.' })
    return
  }
  next()
}
