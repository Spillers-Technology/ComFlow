import { Router, urlencoded } from 'express'
import {
  CompleteMfaLoginRequestSchema,
  CompletePasswordResetRequestSchema,
  ForgotPasswordRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  ResendVerificationRequestSchema,
  VerifyEmailRequestSchema,
} from '../../../shared/src/index.js'
import { config } from '../config.js'
import { asyncHandler, parseBody } from '../lib/http.js'
import { rateLimit } from '../middleware/rateLimit.js'
import {
  AuthService,
  resolveSessionUser,
  toApiUser,
} from '../services/authService.js'
import { PasswordResetService } from '../services/passwordResetService.js'
import { RegistrationService } from '../services/registrationService.js'
import { SsoService } from '../services/ssoService.js'

export function createAuthRouter(
  authService: AuthService,
  ssoService: SsoService,
  registrationService: RegistrationService,
  passwordResetService: PasswordResetService
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

  // Limited per IP to slow credential stuffing. Deliberately looser than the
  // signup limits — a shared office NAT should not lock out real users.
  router.post(
    '/login',
    rateLimit({ windowMs: 15 * 60_000, max: 20 }),
    asyncHandler(async (request, response) => {
      const input = parseBody(LoginRequestSchema, request.body)
      const result = await authService.login(input.email, input.password)
      response.json(result)
    })
  )

  // Second leg of an MFA login. Rate-limited hard: a 6-digit code is only 10^6
  // of entropy, so unbounded attempts would be brute-forceable.
  router.post(
    '/login/mfa',
    rateLimit({ windowMs: 15 * 60_000, max: 10 }),
    asyncHandler((request, response) => {
      const input = parseBody(CompleteMfaLoginRequestSchema, request.body)
      response.json(
        authService.completeMfaLogin(input.challengeToken, input.code)
      )
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

  // Always returns the same response, for the same anti-enumeration reason as
  // resend-verification. Tightly rate-limited: each accepted call sends mail.
  router.post(
    '/forgot-password',
    rateLimit({ windowMs: 15 * 60_000, max: 5 }),
    asyncHandler(async (request, response) => {
      const input = parseBody(ForgotPasswordRequestSchema, request.body)
      await passwordResetService.request(input.email)
      response.json({ accepted: true })
    })
  )

  // Consumes the emailed reset token and signs every existing session out.
  router.post(
    '/reset-password',
    rateLimit({ windowMs: 15 * 60_000, max: 20 }),
    asyncHandler((request, response) => {
      const input = parseBody(CompletePasswordResetRequestSchema, request.body)
      passwordResetService.reset(input.token, input.password)
      response.json({ ok: true })
    })
  )

  // Open endpoint so the client can discover auth state and the current user.
  router.get(
    '/me',
    asyncHandler((request, response) => {
      const header = request.headers.authorization
      const token = header?.startsWith('Bearer ') ? header.slice(7) : null
      const record = token ? resolveSessionUser(token) : null
      const user = record ? toApiUser(record) : null
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
