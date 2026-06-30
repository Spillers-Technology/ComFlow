import { NextFunction, Request, Response } from 'express'
import { User } from '../../../shared/src/index.js'

/**
 * Restrict a route to org-admins (or the platform owner, a superset). Chain
 * after {@link requireAuth}, which populates `res.locals.user` (the open-mode
 * synthetic identity is the owner, so dev/tests pass through unchanged).
 */
export function requireAdmin(
  _request: Request,
  response: Response,
  next: NextFunction
) {
  const user = response.locals.user as User | undefined
  if (!user || (user.role !== 'admin' && user.role !== 'owner')) {
    response.status(403).json({ error: 'Administrator access required.' })
    return
  }
  next()
}
