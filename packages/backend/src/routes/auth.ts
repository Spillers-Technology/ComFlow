import { Router, urlencoded } from 'express'
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  ResendVerificationRequestSchema,
  VerifyEmailRequestSchema,
} from '../../../shared/src/index.js'
import { config } from '../config.js'
import { asyncHandler, parseBody } from '../lib/http.js'
import { verifySessionToken } from '../lib/token.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { AuthService } from '../services/authService.js'
import { RegistrationService } from '../services/registrationService.js'
import { SsoService } from '../services/ssoService.js'

export function createAuthRouter(
  authService: AuthService,
  ssoService: SsoService,
  registrationService: RegistrationService
) {
  const router = Router()

  function providerState() {
    return {
      localEnabled: config.auth.localEnabled,
      providers: ssoService.listProviderInfo(),
      selfRegistrationEnabled: registrationService.enabled,
    }
  }

  // Append the IdP's authorization-code query string onto the registered
  // redirect URI so the URL openid-client validates is exactly what was
  // configured, regardless of proxy host/protocol rewriting.
  function oidcCallbackUrl(originalUrl: string): string {
    const queryIndex = originalUrl.indexOf('?')
    const query = queryIndex >= 0 ? originalUrl.slice(queryIndex) : ''
    return `${config.auth.oidc.redirectUri}${query}`
  }

  function redirectWithToken(token: string): string {
    return `${config.auth.ssoSuccessRedirect}#token=${encodeURIComponent(token)}`
  }

  function redirectWithError(message: string): string {
    return `${config.auth.ssoSuccessRedirect}#error=${encodeURIComponent(message)}`
  }

  router.post(
    '/login',
    asyncHandler(async (request, response) => {
      const input = parseBody(LoginRequestSchema, request.body)
      const result = await authService.login(input.email, input.password)
      response.json(result)
    })
  )

  // Public self-service signup (hosted mode): new tenant + its org-admin in
  // one call. Rate-limited per IP; the real fraud boundary is the wallet,
  // plan caps, verification gate, and dispute freeze.
  router.post(
    '/register',
    rateLimit({ windowMs: 15 * 60_000, max: 10 }),
    asyncHandler(async (request, response) => {
      const input = parseBody(RegisterRequestSchema, request.body)
      const result = await registrationService.register(input)
      response.status(201).json(result)
    })
  )

  // Consumes the emailed verification token; unlocks paid actions.
  router.post(
    '/verify-email',
    rateLimit({ windowMs: 15 * 60_000, max: 30 }),
    asyncHandler((request, response) => {
      const input = parseBody(VerifyEmailRequestSchema, request.body)
      const user = registrationService.verifyEmail(input.token)
      response.json({ user })
    })
  )

  // Always returns the same response so callers cannot use it to discover
  // whether an address has an account. Delivery is rate-limited per source IP.
  router.post(
    '/resend-verification',
    rateLimit({ windowMs: 15 * 60_000, max: 5 }),
    asyncHandler(async (request, response) => {
      const input = parseBody(ResendVerificationRequestSchema, request.body)
      await registrationService.resendVerification(input.email)
      response.json({ accepted: true })
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
      response.json({
        user,
        authRequired: config.auth.required,
        ...providerState(),
      })
    })
  )

  // Lets the login screen render the right sign-in options without a token.
  router.get('/providers', (_request, response) => {
    response.json(providerState())
  })

  // Kick off an SSO login: 302 to the IdP authorize endpoint.
  router.get(
    '/sso/:provider/start',
    asyncHandler(async (request, response) => {
      const provider = String(request.params.provider)
      const redirectUrl = await ssoService.start(provider)
      response.redirect(redirectUrl)
    })
  )

  // OIDC redirect URI. Exchanges the code, then bounces to the SPA with a token.
  router.get(
    '/oidc/callback',
    asyncHandler(async (request, response) => {
      try {
        const state =
          typeof request.query.state === 'string' ? request.query.state : ''
        const result = await ssoService.complete('oidc', {
          callbackUrl: oidcCallbackUrl(request.originalUrl),
          state,
        })
        response.redirect(redirectWithToken(result.token))
      } catch (error) {
        response.redirect(redirectWithError((error as Error).message))
      }
    })
  )

  // SAML assertion consumer service. IdP POSTs a form-encoded SAMLResponse.
  router.post(
    '/saml/acs',
    urlencoded({ extended: false, limit: '2mb' }),
    asyncHandler(async (request, response) => {
      try {
        const body = request.body as Record<string, unknown>
        const state =
          typeof body.RelayState === 'string' ? body.RelayState : ''
        const result = await ssoService.complete('saml', { body, state })
        response.redirect(redirectWithToken(result.token))
      } catch (error) {
        response.redirect(redirectWithError((error as Error).message))
      }
    })
  )

  return router
}
