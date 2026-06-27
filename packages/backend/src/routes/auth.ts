import { Router } from 'express'
import { LoginRequestSchema } from '../../../shared/src/index.js'
import { config } from '../config.js'
import { asyncHandler, parseBody } from '../lib/http.js'
import { verifySessionToken } from '../lib/token.js'
import { AuthService } from '../services/authService.js'

export function createAuthRouter(authService: AuthService) {
  const router = Router()

  router.post(
    '/login',
    asyncHandler(async (request, response) => {
      const input = parseBody(LoginRequestSchema, request.body)
      const result = await authService.login(input.email, input.password)
      response.json(result)
    })
  )

  // Open endpoint so the client can discover auth state and the current user.
  router.get(
    '/me',
    asyncHandler((request, response) => {
      const header = request.headers.authorization
      const token = header?.startsWith('Bearer ') ? header.slice(7) : null
      const userId = token ? verifySessionToken(token) : null
      const user = userId ? authService.getUserById(userId) : null
      response.json({ user, authRequired: config.auth.required })
    })
  )

  return router
}
