import { z } from 'zod'

// A tenant is a customer org or a single paid user. The platform owner manages
// all tenants; org-admins/members are scoped to exactly one.
export const TenantStatusSchema = z.enum(['active', 'suspended'])

export const TenantSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  plan: z.string(),
  status: TenantStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const CreateTenantRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Slug must be lowercase letters, digits, or dashes.')
    .optional(),
  plan: z.string().trim().min(1).max(64).optional(),
})

export const UpdateTenantRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    plan: z.string().trim().min(1).max(64).optional(),
    status: TenantStatusSchema.optional(),
  })
  .refine(value => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  })

export const GetTenantsResponseSchema = z.object({
  items: z.array(TenantSchema),
})

export const TenantResponseSchema = z.object({
  tenant: TenantSchema,
})

export type TenantStatus = z.infer<typeof TenantStatusSchema>
export type Tenant = z.infer<typeof TenantSchema>
export type CreateTenantRequest = z.infer<typeof CreateTenantRequestSchema>
export type UpdateTenantRequest = z.infer<typeof UpdateTenantRequestSchema>
export type GetTenantsResponse = z.infer<typeof GetTenantsResponseSchema>
export type TenantResponse = z.infer<typeof TenantResponseSchema>
