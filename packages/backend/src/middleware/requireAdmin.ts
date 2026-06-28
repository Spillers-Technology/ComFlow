import { NextFunction, Request, Response } from 'express'
import { User } from '../../../shared/src/index.js'

/**
 * Restrict a route to admins. Chain after {@link requireAuth}, which populates
 * `res.locals.user` (the open-mode synthetic identity is an admin, so dev/tests
 * pass through unchanged).
 */
export function requireAdmin(
  _request: Request,
  response: Response,
  next: NextFunction
) {
  const user = response.locals.user as User | undefined
  if (!user || user.role !== 'admin') {
    response.status(403).json({ error: 'Administrator access required.' })
    return
  }
  next()
}
