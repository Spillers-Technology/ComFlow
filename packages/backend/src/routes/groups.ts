import { Router } from 'express'
import {
  CreateGroupRequestSchema,
  SetGroupMailboxesRequestSchema,
  SetGroupMembersRequestSchema,
  SetSsoGroupMappingsRequestSchema,
  UpdateGroupRequestSchema,
  User,
} from '../../../shared/src/index.js'
import { HttpError } from '../lib/errors.js'
import { asyncHandler, parseBody } from '../lib/http.js'
import { groupRepository } from '../repositories/groupRepository.js'
import { mailboxRepository } from '../repositories/mailboxRepository.js'
import { userRepository } from '../repositories/userRepository.js'
import { toApiUser } from '../services/authService.js'

function requireParam(value: string | string[] | undefined, label: string) {
  const id = Array.isArray(value) ? value[0] : value
  if (!id) throw new HttpError(400, `${label} is required.`)
  return id
}

export function createGroupsRouter() {
  const router = Router()

  // Load a group, 404ing if it's missing or owned by another tenant — so
  // tenant isolation holds even for direct id access.
  function requireGroupInTenant(id: string, tenantId: string) {
    if (groupRepository.tenantIdOf(id) !== tenantId) {
      throw new HttpError(404, 'Group not found.')
    }
  }

  router.get('/', (_request, response) => {
    const user = response.locals.user as User
    response.json({ items: groupRepository.listDetail(user.tenantId) })
  })

  // Assignable users for the membership picker (this tenant only).
  router.get('/users', (_request, response) => {
    const user = response.locals.user as User
    response.json({ items: userRepository.list(user.tenantId).map(toApiUser) })
  })

  router.get('/mappings', (_request, response) => {
    response.json({ mappings: groupRepository.listMappings() })
  })

  router.put(
    '/mappings',
    asyncHandler((request, response) => {
      const input = parseBody(SetSsoGroupMappingsRequestSchema, request.body)
      groupRepository.setMappings(input.mappings)
      response.json({ mappings: groupRepository.listMappings() })
    })
  )

  router.post(
    '/',
    asyncHandler((request, response) => {
      const user = response.locals.user as User
      const input = parseBody(CreateGroupRequestSchema, request.body)
      const group = groupRepository.create({ ...input, tenantId: user.tenantId })
      response.status(201).json({ group: groupRepository.getDetail(group.id) })
    })
  )

  router.patch(
    '/:id',
    asyncHandler((request, response) => {
      const user = response.locals.user as User
      const id = requireParam(request.params.id, 'Group id')
      requireGroupInTenant(id, user.tenantId)
      const input = parseBody(UpdateGroupRequestSchema, request.body)
      const group = groupRepository.update(id, input)
      if (!group) throw new HttpError(404, 'Group not found.')
      response.json({ group: groupRepository.getDetail(id) })
    })
  )

  router.delete(
    '/:id',
    asyncHandler((request, response) => {
      const user = response.locals.user as User
      const id = requireParam(request.params.id, 'Group id')
      requireGroupInTenant(id, user.tenantId)
      if (!groupRepository.remove(id)) {
        throw new HttpError(404, 'Group not found.')
      }
      response.status(204).end()
    })
  )

  router.put(
    '/:id/members',
    asyncHandler((request, response) => {
      const user = response.locals.user as User
      const id = requireParam(request.params.id, 'Group id')
      requireGroupInTenant(id, user.tenantId)
      const input = parseBody(SetGroupMembersRequestSchema, request.body)
      // Only users in this tenant may be added — drop any foreign ids.
      const allowed = new Set(
        userRepository.list(user.tenantId).map(member => member.id)
      )
      groupRepository.setMembers(
        id,
        input.userIds.filter(userId => allowed.has(userId))
      )
      response.json({ group: groupRepository.getDetail(id) })
    })
  )

  router.put(
    '/:id/mailboxes',
    asyncHandler((request, response) => {
      const user = response.locals.user as User
      const id = requireParam(request.params.id, 'Group id')
      requireGroupInTenant(id, user.tenantId)
      const input = parseBody(SetGroupMailboxesRequestSchema, request.body)
      // Only mailboxes in this tenant may be granted — drop any foreign ids.
      const allowed = new Set(
        mailboxRepository.list(user.tenantId).map(mailbox => mailbox.id)
      )
      groupRepository.setMailboxes(
        id,
        input.mailboxIds.filter(mailboxId => allowed.has(mailboxId))
      )
      response.json({ group: groupRepository.getDetail(id) })
    })
  )

  return router
}
