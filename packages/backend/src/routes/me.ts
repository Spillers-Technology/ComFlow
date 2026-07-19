import { Router } from 'express'
import {
  ChangePasswordSchema,
  CreateApiKeyRequestSchema,
  DisableMfaRequestSchema,
  MfaConfirmRequestSchema,
  UpdateProfileSchema,
  User,
} from '../../../shared/src/index.js'
import { db } from '../db/client.js'
import { HttpError } from '../lib/errors.js'
import { asyncHandler, parseBody } from '../lib/http.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { signSessionToken } from '../lib/token.js'
import { userRepository } from '../repositories/userRepository.js'
import { apiKeyService } from '../services/apiKeyService.js'
import { toApiUser } from '../services/authService.js'
import { MfaService } from '../services/mfaService.js'
import { RegistrationService } from '../services/registrationService.js'

function requireCurrentRecord(user: User) {
  const record = userRepository.getById(user.id)
  if (!record) {
    throw new HttpError(404, 'User not found.')
  }
  return record
}

function requireParam(value: string | string[] | undefined, label: string) {
  const id = Array.isArray(value) ? value[0] : value
  if (!id) throw new HttpError(400, `${label} is required.`)
  return id
}

export function createMeRouter(
  registrationService: RegistrationService,
  mfaService: MfaService
) {
  const router = Router()

  router.get(
    '/',
    asyncHandler((_request, response) => {
      response.json({ user: response.locals.user as User })
    })
  )

  router.patch(
    '/',
    asyncHandler(async (request, response) => {
      const current = response.locals.user as User
      const existing = requireCurrentRecord(current)
      const input = parseBody(UpdateProfileSchema, request.body)

      if (existing.authProvider === 'local') {
        const user = await registrationService.updateLocalProfile(existing, input)
        response.json({ user })
        return
      } else if (input.email.toLowerCase() !== existing.email.toLowerCase()) {
        throw new HttpError(400, 'Email can only be changed for local users.')
      }

      const user = userRepository.updateProfile(existing.id, {
        displayName: input.displayName,
      })
      response.json({ user: toApiUser(user!) })
    })
  )

  router.post(
    '/password',
    asyncHandler((request, response) => {
      const existing = requireCurrentRecord(response.locals.user as User)
      if (existing.passwordHash === null) {
        throw new HttpError(400, 'Password changes are only available for local users.')
      }

      const input = parseBody(ChangePasswordSchema, request.body)
      if (!verifyPassword(input.currentPassword, existing.passwordHash)) {
        throw new HttpError(400, 'Current password is incorrect.')
      }

      // Bumping the epoch signs out every other device. It would sign this one
      // out too, so hand back a freshly minted token to swap in.
      db.transaction(() => {
        userRepository.setPassword(existing.id, hashPassword(input.newPassword))
        userRepository.bumpSessionEpoch(existing.id)
      })()
      const updated = userRepository.getById(existing.id)!
      response.json({ token: signSessionToken(updated.id, updated.sessionEpoch) })
    })
  )

  router.get(
    '/mfa',
    asyncHandler((_request, response) => {
      const existing = requireCurrentRecord(response.locals.user as User)
      response.json({
        enabled: Boolean(existing.totpEnabledAt),
        recoveryCodesRemaining: existing.totpEnabledAt
          ? existing.totpRecoveryCodes.length
          : null,
      })
    })
  )

  // Mints a secret to show as a QR code. MFA stays off until /mfa/confirm
  // proves the authenticator produces valid codes.
  router.post(
    '/mfa/enroll',
    asyncHandler((_request, response) => {
      const existing = requireCurrentRecord(response.locals.user as User)
      response.json(mfaService.beginEnrollment(existing.id, 'ComFlow'))
    })
  )

  router.post(
    '/mfa/confirm',
    asyncHandler((request, response) => {
      const existing = requireCurrentRecord(response.locals.user as User)
      const input = parseBody(MfaConfirmRequestSchema, request.body)
      response.json(mfaService.confirmEnrollment(existing.id, input.code))
    })
  )

  // Turning MFA off is a security downgrade, so re-check the password rather
  // than trusting the session alone.
  router.delete(
    '/mfa',
    asyncHandler((request, response) => {
      const existing = requireCurrentRecord(response.locals.user as User)
      const input = parseBody(DisableMfaRequestSchema, request.body)
      if (
        existing.passwordHash === null ||
        !verifyPassword(input.password, existing.passwordHash)
      ) {
        throw new HttpError(400, 'Current password is incorrect.')
      }
      mfaService.disable(existing.id)
      response.status(204).end()
    })
  )

  router.get(
    '/keys',
    asyncHandler((_request, response) => {
      const current = response.locals.user as User
      response.json({ items: apiKeyService.list(current.id) })
    })
  )

  router.post(
    '/keys',
    asyncHandler((request, response) => {
      const current = response.locals.user as User
      requireCurrentRecord(current)
      const input = parseBody(CreateApiKeyRequestSchema, request.body)
      response.status(201).json(apiKeyService.create(current.id, input.name))
    })
  )

  router.delete(
    '/keys/:id',
    asyncHandler((request, response) => {
      const current = response.locals.user as User
      const id = requireParam(request.params.id, 'API key id')
      if (!apiKeyService.revoke(current.id, id)) {
        throw new HttpError(404, 'API key not found.')
      }
      response.status(204).end()
    })
  )

  return router
}
