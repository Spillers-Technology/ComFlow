import { z } from 'zod'
import { MailboxSchema } from './mailbox.js'
import { UserSchema } from './auth.js'

export const GroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// A group plus the members and mailbox grants attached to it, for the admin UI.
export const GroupDetailSchema = GroupSchema.extend({
  members: z.array(UserSchema),
  mailboxes: z.array(MailboxSchema),
})

export const CreateGroupRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
})

export const UpdateGroupRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .refine(value => Object.keys(value).length > 0, {
    message: 'At least one field is required.',
  })

export const SetGroupMembersRequestSchema = z.object({
  userIds: z.array(z.string()),
})

export const SetGroupMailboxesRequestSchema = z.object({
  mailboxIds: z.array(z.string()),
})

export const SsoGroupMappingSchema = z.object({
  externalName: z.string(),
  groupId: z.string(),
})

export const SetSsoGroupMappingsRequestSchema = z.object({
  mappings: z.array(SsoGroupMappingSchema),
})

export const GroupListResponseSchema = z.object({
  items: z.array(GroupDetailSchema),
})

export const GroupResponseSchema = z.object({
  group: GroupDetailSchema,
})

export const GroupUsersResponseSchema = z.object({
  items: z.array(UserSchema),
})

export const SsoGroupMappingsResponseSchema = z.object({
  mappings: z.array(SsoGroupMappingSchema),
})

export type Group = z.infer<typeof GroupSchema>
export type GroupDetail = z.infer<typeof GroupDetailSchema>
export type CreateGroupRequest = z.infer<typeof CreateGroupRequestSchema>
export type UpdateGroupRequest = z.infer<typeof UpdateGroupRequestSchema>
export type SetGroupMembersRequest = z.infer<typeof SetGroupMembersRequestSchema>
export type SetGroupMailboxesRequest = z.infer<
  typeof SetGroupMailboxesRequestSchema
>
export type SsoGroupMapping = z.infer<typeof SsoGroupMappingSchema>
export type SetSsoGroupMappingsRequest = z.infer<
  typeof SetSsoGroupMappingsRequestSchema
>
export type GroupListResponse = z.infer<typeof GroupListResponseSchema>
export type GroupResponse = z.infer<typeof GroupResponseSchema>
export type GroupUsersResponse = z.infer<typeof GroupUsersResponseSchema>
export type SsoGroupMappingsResponse = z.infer<
  typeof SsoGroupMappingsResponseSchema
>
