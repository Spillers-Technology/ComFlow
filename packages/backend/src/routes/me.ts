import { Router } from 'express'
import {
  BeginMfaEnrollmentRequestSchema,
  ChangePasswordSchema,
  CreateApiKeyRequestSchema,
  DisableMfaRequestSchema,
  MfaConfirmRequestSchema,
  UpdateProfileSchema,
  User,
} from '../../../shared/src/index.js'
import { HttpError } from '../lib/errors.js'
import { db } from '../db/client.js'
import { asyncHandler, parseBody } from '../lib/http.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { signSessionToken } from '../lib/token.js'
import { userRepository } from '../repositories/userRepository.js'
import { auditRepository } from '../repositories/auditRepository.js'
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

      db.transaction(() => {
        userRepository.replacePassword(
          existing.id,
          hashPassword(input.newPassword)
        )
        auditRepository.record({
          actor: existing.id,
          action: 'password.changed',
          tenantId: existing.tenantId,
        })
      })()
      const updated = userRepository.getById(existing.id)!
      response.json({
        token: signSessionToken(updated.id, updated.sessionEpoch),
      })
    })
  )

  router.get(
    '/mfa',
    asyncHandler((_request, response) => {
      const existing = requireCurrentRecord(response.locals.user as User)
      response.json({
        enabled: Boolean(existing.totpEnabledAt),
        recoveryCodesRemaining: existing.totpEnabledAt
          ? mfaService.recoveryCodeCount(existing.id)
          : null,
      })
    })
  )

  router.post(
    '/mfa/enroll',
    asyncHandler((request, response) => {
      const existing = requireCurrentRecord(response.locals.user as User)
      const input = parseBody(BeginMfaEnrollmentRequestSchema, request.body)
      response.json(mfaService.beginEnrollment(existing.id, input.password))
    })
  )

  router.post(
    '/mfa/confirm',
    asyncHandler((request, response) => {
      const existing = requireCurrentRecord(response.locals.user as User)
      const input = parseBody(MfaConfirmRequestSchema, request.body)
      const result = mfaService.confirmEnrollment(existing.id, input.code)
      response.json({
        recoveryCodes: result.recoveryCodes,
        token: signSessionToken(result.record.id, result.record.sessionEpoch),
      })
    })
  )

  router.delete(
    '/mfa',
    asyncHandler((request, response) => {
      const existing = requireCurrentRecord(response.locals.user as User)
      const input = parseBody(DisableMfaRequestSchema, request.body)
      const updated = mfaService.disable(
        existing.id,
        input.password,
        input.code
      )
      response.json({
        token: signSessionToken(updated.id, updated.sessionEpoch),
      })
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
