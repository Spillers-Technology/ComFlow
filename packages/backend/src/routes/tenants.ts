import { Router } from 'express'
import {
  CreateTenantRequestSchema,
  CreateUserRequestSchema,
  UpdateTenantLimitsRequestSchema,
  UpdateTenantRequestSchema,
} from '../../../shared/src/index.js'
import { User } from '../../../shared/src/index.js'
import { HttpError } from '../lib/errors.js'
import { asyncHandler, parseBody } from '../lib/http.js'
import { hashPassword } from '../lib/password.js'
import { slugify } from '../lib/slug.js'
import { requireOwner } from '../middleware/requireOwner.js'
import { auditRepository } from '../repositories/auditRepository.js'
import { tenantLimitsRepository } from '../repositories/tenantLimitsRepository.js'
import { tenantRepository } from '../repositories/tenantRepository.js'
import { userRepository } from '../repositories/userRepository.js'
import { toApiUser } from '../services/authService.js'

function requireParam(value: string | string[] | undefined, label: string) {
  const id = Array.isArray(value) ? value[0] : value
  if (!id) throw new HttpError(400, `${label} is required.`)
  return id
}

/** Platform-owner tenant management: create/list/update tenants, set plan limits,
 * and seed a tenant's first org-admin. Owner-only across the board. */
export function createTenantsRouter() {
  const router = Router()
  router.use(requireOwner)

  router.get('/', (_request, response) => {
    response.json({ items: tenantRepository.list() })
  })

  router.post(
    '/',
    asyncHandler((request, response) => {
      const input = parseBody(CreateTenantRequestSchema, request.body)
      const slug = input.slug ?? slugify(input.name)
      if (tenantRepository.getBySlug(slug)) {
        throw new HttpError(409, 'A tenant with that slug already exists.')
      }
      const tenant = tenantRepository.create({
        name: input.name,
        slug,
        plan: input.plan,
      })
      // Materialize default limits so the new tenant is immediately usable.
      tenantLimitsRepository.get(tenant.id)
      response.status(201).json({ tenant })
    })
  )

  router.patch(
    '/:id',
    asyncHandler((request, response) => {
      const id = requireParam(request.params.id, 'Tenant id')
      const input = parseBody(UpdateTenantRequestSchema, request.body)
      const previous = tenantRepository.getById(id)
      const tenant = tenantRepository.update(id, input)
      if (!tenant) throw new HttpError(404, 'Tenant not found.')
      // Freeze/unfreeze is a privileged action worth an audit row either way.
      if (input.status && input.status !== previous?.status) {
        const user = response.locals.user as User
        auditRepository.record({
          actor: user.id,
          action: input.status === 'suspended' ? 'tenant.freeze' : 'tenant.unfreeze',
          tenantId: id,
          detail: { via: 'tenants-api' },
        })
      }
      response.json({ tenant })
    })
  )

  // The tenant's audit trail: registrations, DID orders, wallet credits,
  // freezes. Owner-only, most recent first.
  router.get(
    '/:id/audit',
    asyncHandler((request, response) => {
      const id = requireParam(request.params.id, 'Tenant id')
      if (!tenantRepository.getById(id)) {
        throw new HttpError(404, 'Tenant not found.')
      }
      response.json({ items: auditRepository.listByTenant(id) })
    })
  )

  router.get(
    '/:id/limits',
    asyncHandler((request, response) => {
      const id = requireParam(request.params.id, 'Tenant id')
      if (!tenantRepository.getById(id)) {
        throw new HttpError(404, 'Tenant not found.')
      }
      response.json({ limits: tenantLimitsRepository.get(id) })
    })
  )

  router.patch(
    '/:id/limits',
    asyncHandler((request, response) => {
      const id = requireParam(request.params.id, 'Tenant id')
      if (!tenantRepository.getById(id)) {
        throw new HttpError(404, 'Tenant not found.')
      }
      const input = parseBody(UpdateTenantLimitsRequestSchema, request.body)
      response.json({ limits: tenantLimitsRepository.update(id, input) })
    })
  )

  // Seed a tenant's first org-admin (or any user) — used by onboarding runbooks.
  router.post(
    '/:id/users',
    asyncHandler((request, response) => {
      const id = requireParam(request.params.id, 'Tenant id')
      if (!tenantRepository.getById(id)) {
        throw new HttpError(404, 'Tenant not found.')
      }
      const input = parseBody(CreateUserRequestSchema, request.body)
      if (userRepository.getByEmail(input.email)) {
        throw new HttpError(409, 'A user with that email already exists.')
      }
      const user = userRepository.create({
        email: input.email,
        displayName: input.displayName ?? null,
        passwordHash: hashPassword(input.password),
        role: input.role,
        tenantId: id,
      })
      response.status(201).json({ user: toApiUser(user) })
    })
  )

  return router
}
