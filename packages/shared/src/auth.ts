import { z } from 'zod'

export const UserRoleSchema = z.enum(['admin', 'member'])

export const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string().nullable(),
  role: UserRoleSchema,
  authProvider: z.string(),
})

export const LoginRequestSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
})

export const LoginResponseSchema = z.object({
  token: z.string(),
  user: UserSchema,
})

export const MeResponseSchema = z.object({
  // null when authentication is required but the caller is not signed in.
  user: UserSchema.nullable(),
  // false when COMFLOW_AUTH_REQUIRED is off (open mode).
  authRequired: z.boolean(),
})

export type UserRole = z.infer<typeof UserRoleSchema>
export type User = z.infer<typeof UserSchema>
export type LoginRequest = z.infer<typeof LoginRequestSchema>
export type LoginResponse = z.infer<typeof LoginResponseSchema>
export type MeResponse = z.infer<typeof MeResponseSchema>
