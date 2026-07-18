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
  password: z.string().min(1),
})

export const LoginResponseSchema = z.object({
  token: z.string(),
  user: UserSchema,
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
})

export const AuthProvidersResponseSchema = z.object({
  localEnabled: z.boolean(),
  providers: z.array(SsoProviderInfoSchema),
  selfRegistrationEnabled: z.boolean().default(false),
})

export type UserRole = z.infer<typeof UserRoleSchema>
export type User = z.infer<typeof UserSchema>
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>
export type VerifyEmailRequest = z.infer<typeof VerifyEmailRequestSchema>
export type SsoProviderInfo = z.infer<typeof SsoProviderInfoSchema>
export type AuthProvidersResponse = z.infer<typeof AuthProvidersResponseSchema>
export type LoginRequest = z.infer<typeof LoginRequestSchema>
export type LoginResponse = z.infer<typeof LoginResponseSchema>
export type MeResponse = z.infer<typeof MeResponseSchema>
