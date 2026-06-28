import { Router } from 'express'
import {
  CreateGroupRequestSchema,
  SetGroupMailboxesRequestSchema,
  SetGroupMembersRequestSchema,
  SetSsoGroupMappingsRequestSchema,
  UpdateGroupRequestSchema,
} from '../../../shared/src/index.js'
import { HttpError } from '../lib/errors.js'
import { asyncHandler, parseBody } from '../lib/http.js'
import { groupRepository } from '../repositories/groupRepository.js'
import { userRepository } from '../repositories/userRepository.js'
import { toApiUser } from '../services/authService.js'

function requireParam(value: string | string[] | undefined, label: string) {
  const id = Array.isArray(value) ? value[0] : value
  if (!id) throw new HttpError(400, `${label} is required.`)
  return id
}

export function createGroupsRouter() {
  const router = Router()

  router.get('/', (_request, response) => {
    response.json({ items: groupRepository.listDetail() })
  })

  // Assignable users for the membership picker.
  router.get('/users', (_request, response) => {
    response.json({ items: userRepository.list().map(toApiUser) })
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
      const input = parseBody(CreateGroupRequestSchema, request.body)
      const group = groupRepository.create(input)
      response.status(201).json({ group: groupRepository.getDetail(group.id) })
    })
  )

  router.patch(
    '/:id',
    asyncHandler((request, response) => {
      const id = requireParam(request.params.id, 'Group id')
      const input = parseBody(UpdateGroupRequestSchema, request.body)
      const group = groupRepository.update(id, input)
      if (!group) throw new HttpError(404, 'Group not found.')
      response.json({ group: groupRepository.getDetail(id) })
    })
  )

  router.delete(
    '/:id',
    asyncHandler((request, response) => {
      const id = requireParam(request.params.id, 'Group id')
      if (!groupRepository.remove(id)) {
        throw new HttpError(404, 'Group not found.')
      }
      response.status(204).end()
    })
  )

  router.put(
    '/:id/members',
    asyncHandler((request, response) => {
      const id = requireParam(request.params.id, 'Group id')
      if (!groupRepository.getById(id)) throw new HttpError(404, 'Group not found.')
      const input = parseBody(SetGroupMembersRequestSchema, request.body)
      groupRepository.setMembers(id, input.userIds)
      response.json({ group: groupRepository.getDetail(id) })
    })
  )

  router.put(
    '/:id/mailboxes',
    asyncHandler((request, response) => {
      const id = requireParam(request.params.id, 'Group id')
      if (!groupRepository.getById(id)) throw new HttpError(404, 'Group not found.')
      const input = parseBody(SetGroupMailboxesRequestSchema, request.body)
      groupRepository.setMailboxes(id, input.mailboxIds)
      response.json({ group: groupRepository.getDetail(id) })
    })
  )

  return router
}
