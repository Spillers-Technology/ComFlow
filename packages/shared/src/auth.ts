import { z } from 'zod'
import { TenantSchema } from './tenant.js'

// `owner` is the platform owner (global, sees every tenant). `admin` and
// `member` are scoped to a single tenant: admin manages their own org, member
// sees only group-granted mailboxes within it.
export const UserRoleSchema = z.enum(['owner', 'admin', 'member'])

export const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string().nullable(),
  role: UserRoleSchema,
  authProvider: z.string(),
  // The tenant this user belongs to. The platform owner spans all tenants but
  // still has a home tenant id for attribution.
  tenantId: z.string(),
  // False only for self-registered accounts that haven't clicked their
  // verification link yet; paid actions (top-up, DID provisioning) are gated on
  // it. Defaults true so operator-created and SSO accounts are unaffected.
  emailVerified: z.boolean().default(true),
})

export const LoginRequestSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
})

export const SessionGrantSchema = z.object({
  token: z.string(),
  user: UserSchema,
})

export const MfaChallengeSchema = z.object({
  mfaRequired: z.literal(true),
  challengeToken: z.string(),
})

export const LoginResponseSchema = z.union([
  SessionGrantSchema,
  MfaChallengeSchema,
])

export const CompleteMfaLoginRequestSchema = z.object({
  challengeToken: z.string().trim().min(1).max(128),
  code: z.string().trim().min(6).max(32),
})

export const MfaStatusSchema = z.object({
  enabled: z.boolean(),
  recoveryCodesRemaining: z.number().int().nonnegative().nullable(),
})

export const BeginMfaEnrollmentRequestSchema = z.object({
  password: z.string().min(1).max(200),
})

export const MfaEnrollResponseSchema = z.object({
  secret: z.string(),
  otpauthUri: z.string(),
  expiresAt: z.string(),
})

export const MfaConfirmRequestSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/),
})

export const MfaConfirmResponseSchema = z.object({
  recoveryCodes: z.array(z.string()),
  token: z.string(),
})

export const DisableMfaRequestSchema = z.object({
  password: z.string().min(1).max(200),
  code: z.string().trim().min(6).max(32),
})

export const SessionRefreshResponseSchema = z.object({
  token: z.string(),
})

// Self-service signup: creates a new tenant with the caller as its org-admin.
// Only honored when COMFLOW_SELF_REGISTRATION=true and auth is required.
export const RegisterRequestSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(120).optional(),
  // Tenant name; defaults to the display name or the email's mailbox part.
  organizationName: z.string().trim().min(1).max(120).optional(),
})

export const RegisterResponseSchema = z.object({
  token: z.string(),
  user: UserSchema,
  tenant: TenantSchema,
  // True when a verification email was sent and paid actions are gated until
  // the link is clicked; false when the deployment auto-verifies (no SMTP).
  verificationRequired: z.boolean(),
})

export const VerifyEmailRequestSchema = z.object({
  token: z.string().trim().min(1),
})

export const ResendVerificationRequestSchema = z.object({
  email: z.string().trim().email(),
})

export const ResendVerificationResponseSchema = z.object({
  // Always true, including for unknown/already-verified addresses, so this
  // public endpoint cannot be used to enumerate accounts.
  accepted: z.literal(true),
})

export const ForgotPasswordRequestSchema = z.object({
  email: z.string().trim().email(),
})

export const ForgotPasswordResponseSchema = z.object({
  // Always true so this endpoint cannot be used to enumerate accounts.
  accepted: z.literal(true),
})

// Distinct from users.ts's admin-only ResetPasswordRequestSchema. This one
// consumes a random, emailed, single-use token.
export const CompletePasswordResetRequestSchema = z.object({
  token: z.string().trim().min(1).max(128),
  password: z.string().min(8).max(200),
})

export const CompletePasswordResetResponseSchema = z.object({
  ok: z.literal(true),
})

export const SsoProviderInfoSchema = z.object({
  id: z.enum(['oidc', 'saml']),
  label: z.string(),
})

export const MeResponseSchema = z.object({
  // null when authentication is required but the caller is not signed in.
  user: UserSchema.nullable(),
  // false when COMFLOW_AUTH_REQUIRED is off (open mode).
  authRequired: z.boolean(),
  // false hides the email/password form (SSO-only deployments).
  localEnabled: z.boolean(),
  // Enabled SSO providers, used to render sign-in buttons.
  providers: z.array(SsoProviderInfoSchema),
  // True when the login screen should offer "Create account" (hosted mode).
  selfRegistrationEnabled: z.boolean().default(false),
  // True only when local auth and SMTP notifications can deliver reset links.
  passwordResetEnabled: z.boolean().default(false),
})

export const AuthProvidersResponseSchema = z.object({
  localEnabled: z.boolean(),
  providers: z.array(SsoProviderInfoSchema),
  selfRegistrationEnabled: z.boolean().default(false),
  passwordResetEnabled: z.boolean().default(false),
})

export type UserRole = z.infer<typeof UserRoleSchema>
export type User = z.infer<typeof UserSchema>
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>
export type VerifyEmailRequest = z.infer<typeof VerifyEmailRequestSchema>
export type ResendVerificationRequest = z.infer<
  typeof ResendVerificationRequestSchema
>
export type ResendVerificationResponse = z.infer<
  typeof ResendVerificationResponseSchema
>
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>
export type ForgotPasswordResponse = z.infer<
  typeof ForgotPasswordResponseSchema
>
export type CompletePasswordResetRequest = z.infer<
  typeof CompletePasswordResetRequestSchema
>
export type SsoProviderInfo = z.infer<typeof SsoProviderInfoSchema>
export type AuthProvidersResponse = z.infer<typeof AuthProvidersResponseSchema>
export type LoginRequest = z.infer<typeof LoginRequestSchema>
export type LoginResponse = z.infer<typeof LoginResponseSchema>
export type SessionGrant = z.infer<typeof SessionGrantSchema>
export type MfaChallenge = z.infer<typeof MfaChallengeSchema>
export type CompleteMfaLoginRequest = z.infer<
  typeof CompleteMfaLoginRequestSchema
>
export type MfaStatus = z.infer<typeof MfaStatusSchema>
export type BeginMfaEnrollmentRequest = z.infer<
  typeof BeginMfaEnrollmentRequestSchema
>
export type MfaEnrollResponse = z.infer<typeof MfaEnrollResponseSchema>
export type MfaConfirmRequest = z.infer<typeof MfaConfirmRequestSchema>
export type MfaConfirmResponse = z.infer<typeof MfaConfirmResponseSchema>
export type DisableMfaRequest = z.infer<typeof DisableMfaRequestSchema>
export type MeResponse = z.infer<typeof MeResponseSchema>
