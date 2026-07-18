import { NextFunction, Request, Response } from 'express'
import { User } from '../../../shared/src/index.js'

/**
 * Gate paid actions (wallet top-up, DID provisioning) until a self-registered
 * account has clicked its verification link. Operator-created, SSO, bootstrap,
 * and open-mode identities are always verified, so nothing else is affected.
 * Chain after {@link requireAuth}.
 */
export function requireVerifiedEmail(
  _request: Request,
  response: Response,
  next: NextFunction
) {
  const user = response.locals.user as User | undefined
  if (user && user.emailVerified === false) {
    response.status(403).json({
      error: 'Verify your email address to continue. Check your inbox for the link.',
    })
    return
  }
  next()
}
