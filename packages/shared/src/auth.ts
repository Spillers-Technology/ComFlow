import { z } from 'zod'

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
})

export const LoginRequestSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
})

export const LoginResponseSchema = z.object({
  token: z.string(),
  user: UserSchema,
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
})

export const AuthProvidersResponseSchema = z.object({
  localEnabled: z.boolean(),
  providers: z.array(SsoProviderInfoSchema),
})

export type UserRole = z.infer<typeof UserRoleSchema>
export type User = z.infer<typeof UserSchema>
export type SsoProviderInfo = z.infer<typeof SsoProviderInfoSchema>
export type AuthProvidersResponse = z.infer<typeof AuthProvidersResponseSchema>
export type LoginRequest = z.infer<typeof LoginRequestSchema>
export type LoginResponse = z.infer<typeof LoginResponseSchema>
export type MeResponse = z.infer<typeof MeResponseSchema>
