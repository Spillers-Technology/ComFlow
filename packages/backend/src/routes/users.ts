import { Router } from 'express'
import {
  CreateUserRequestSchema,
  ResetPasswordRequestSchema,
  UpdateUserRequestSchema,
  User,
} from '../../../shared/src/index.js'
import { HttpError } from '../lib/errors.js'
import { asyncHandler, parseBody } from '../lib/http.js'
import { hashPassword } from '../lib/password.js'
import { userRepository } from '../repositories/userRepository.js'
import { toApiUser } from '../services/authService.js'

function requireParam(value: string | string[] | undefined, label: string) {
  const id = Array.isArray(value) ? value[0] : value
  if (!id) throw new HttpError(400, `${label} is required.`)
  return id
}

export function createUsersRouter() {
  const router = Router()

  router.get('/', (_request, response) => {
    response.json({ items: userRepository.list().map(toApiUser) })
  })

  router.post(
    '/',
    asyncHandler((request, response) => {
      const input = parseBody(CreateUserRequestSchema, request.body)
      if (userRepository.getByEmail(input.email)) {
        throw new HttpError(409, 'A user with that email already exists.')
      }
      const user = userRepository.create({
        email: input.email,
        displayName: input.displayName ?? null,
        passwordHash: hashPassword(input.password),
        role: input.role,
      })
      response.status(201).json({ user: toApiUser(user) })
    })
  )

  router.patch(
    '/:id',
    asyncHandler((request, response) => {
      const id = requireParam(request.params.id, 'User id')
      const existing = userRepository.getById(id)
      if (!existing) throw new HttpError(404, 'User not found.')

      const input = parseBody(UpdateUserRequestSchema, request.body)
      // Don't let the last admin be demoted out of existence.
      if (
        input.role === 'member' &&
        existing.role === 'admin' &&
        userRepository.countAdmins() <= 1
      ) {
        throw new HttpError(400, 'Cannot demote the last administrator.')
      }
      const user = userRepository.update(id, input)
      response.json({ user: toApiUser(user!) })
    })
  )

  router.post(
    '/:id/password',
    asyncHandler((request, response) => {
      const id = requireParam(request.params.id, 'User id')
      if (!userRepository.getById(id)) throw new HttpError(404, 'User not found.')
      const input = parseBody(ResetPasswordRequestSchema, request.body)
      userRepository.setPassword(id, hashPassword(input.password))
      response.status(204).end()
    })
  )

  router.delete(
    '/:id',
    asyncHandler((request, response) => {
      const id = requireParam(request.params.id, 'User id')
      const existing = userRepository.getById(id)
      if (!existing) throw new HttpError(404, 'User not found.')

      const current = response.locals.user as User
      if (current.id === id) {
        throw new HttpError(400, 'You cannot delete your own account.')
      }
      if (existing.role === 'admin' && userRepository.countAdmins() <= 1) {
        throw new HttpError(400, 'Cannot delete the last administrator.')
      }
      userRepository.remove(id)
      response.status(204).end()
    })
  )

  return router
}
