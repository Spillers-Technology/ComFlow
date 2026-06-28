import { randomUUID } from 'node:crypto'
import {
  Group,
  GroupDetail,
  GroupSchema,
  Mailbox,
  MailboxSchema,
  SsoGroupMapping,
  User,
  UserSchema,
} from '../../../shared/src/index.js'
import { db } from '../db/client.js'

type GroupRow = {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

function mapGroup(row: GroupRow): Group {
  return GroupSchema.parse({
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function membersOf(groupId: string): User[] {
  const rows = db
    .prepare(`
      SELECT u.id, u.email, u.display_name, u.role, u.auth_provider
      FROM group_members gm
      JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ?
      ORDER BY lower(u.email) ASC
    `)
    .all(groupId) as {
    id: string
    email: string
    display_name: string | null
    role: User['role']
    auth_provider: string
  }[]
  return rows.map(row =>
    UserSchema.parse({
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      authProvider: row.auth_provider,
    })
  )
}

function mailboxesOf(groupId: string): Mailbox[] {
  const rows = db
    .prepare(`
      SELECT m.*
      FROM group_mailboxes gm
      JOIN mailboxes m ON m.id = gm.mailbox_id
      WHERE gm.group_id = ?
      ORDER BY datetime(m.created_at) ASC
    `)
    .all(groupId) as {
    id: string
    name: string
    number: string | null
    greeting_prompt_id: string | null
    sip_account_ref: string | null
    created_at: string
    updated_at: string
  }[]
  return rows.map(row =>
    MailboxSchema.parse({
      id: row.id,
      name: row.name,
      number: row.number,
      greetingPromptId: row.greeting_prompt_id,
      sipAccountRef: row.sip_account_ref,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
  )
}

function toDetail(group: Group): GroupDetail {
  return {
    ...group,
    members: membersOf(group.id),
    mailboxes: mailboxesOf(group.id),
  }
}

export const groupRepository = {
  list(): Group[] {
    const rows = db
      .prepare('SELECT * FROM groups ORDER BY lower(name) ASC')
      .all() as GroupRow[]
    return rows.map(mapGroup)
  },

  listDetail(): GroupDetail[] {
    return this.list().map(toDetail)
  },

  getById(id: string): Group | null {
    const row = db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as
      | GroupRow
      | undefined
    return row ? mapGroup(row) : null
  },

  getDetail(id: string): GroupDetail | null {
    const group = this.getById(id)
    return group ? toDetail(group) : null
  },

  create(input: { name: string; description?: string | null }): Group {
    const now = new Date().toISOString()
    const row: GroupRow = {
      id: randomUUID(),
      name: input.name,
      description: input.description ?? null,
      created_at: now,
      updated_at: now,
    }
    db.prepare(`
      INSERT INTO groups (id, name, description, created_at, updated_at)
      VALUES (@id, @name, @description, @created_at, @updated_at)
    `).run(row)
    return mapGroup(row)
  },

  update(
    id: string,
    patch: { name?: string; description?: string | null }
  ): Group | null {
    const existing = this.getById(id)
    if (!existing) return null
    db.prepare(`
      UPDATE groups SET name = ?, description = ?, updated_at = ? WHERE id = ?
    `).run(
      patch.name ?? existing.name,
      patch.description !== undefined ? patch.description : existing.description,
      new Date().toISOString(),
      id
    )
    return this.getById(id)
  },

  remove(id: string): boolean {
    const result = db.prepare('DELETE FROM groups WHERE id = ?').run(id)
    return result.changes > 0
  },

  setMembers(groupId: string, userIds: string[]): void {
    const replace = db.transaction((ids: string[]) => {
      db.prepare('DELETE FROM group_members WHERE group_id = ?').run(groupId)
      const insert = db.prepare(
        'INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)'
      )
      for (const userId of ids) insert.run(groupId, userId)
    })
    replace(userIds)
  },

  addMember(groupId: string, userId: string): void {
    db.prepare(
      'INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)'
    ).run(groupId, userId)
  },

  setMailboxes(groupId: string, mailboxIds: string[]): void {
    const replace = db.transaction((ids: string[]) => {
      db.prepare('DELETE FROM group_mailboxes WHERE group_id = ?').run(groupId)
      const insert = db.prepare(
        'INSERT OR IGNORE INTO group_mailboxes (group_id, mailbox_id) VALUES (?, ?)'
      )
      for (const mailboxId of ids) insert.run(groupId, mailboxId)
    })
    replace(mailboxIds)
  },

  /** Distinct mailbox ids visible to a user across all their group grants. */
  mailboxIdsForUser(userId: string): string[] {
    const rows = db
      .prepare(`
        SELECT DISTINCT gm.mailbox_id AS mailbox_id
        FROM group_members mem
        JOIN group_mailboxes gm ON gm.group_id = mem.group_id
        WHERE mem.user_id = ?
      `)
      .all(userId) as { mailbox_id: string }[]
    return rows.map(row => row.mailbox_id)
  },

  // --- SSO group mappings (IdP group name → ComFlow group) ---

  listMappings(): SsoGroupMapping[] {
    const rows = db
      .prepare('SELECT external_name, group_id FROM sso_group_mappings ORDER BY lower(external_name) ASC')
      .all() as { external_name: string; group_id: string }[]
    return rows.map(row => ({
      externalName: row.external_name,
      groupId: row.group_id,
    }))
  },

  setMappings(mappings: SsoGroupMapping[]): void {
    const replace = db.transaction((items: SsoGroupMapping[]) => {
      db.prepare('DELETE FROM sso_group_mappings').run()
      const insert = db.prepare(
        'INSERT OR REPLACE INTO sso_group_mappings (external_name, group_id) VALUES (?, ?)'
      )
      for (const item of items) insert.run(item.externalName, item.groupId)
    })
    replace(mappings)
  },

  /** ComFlow group ids mapped from a set of IdP group names (case-insensitive). */
  groupIdsForExternalNames(names: string[]): string[] {
    if (names.length === 0) return []
    const lowered = new Set(names.map(name => name.toLowerCase()))
    return this.listMappings()
      .filter(mapping => lowered.has(mapping.externalName.toLowerCase()))
      .map(mapping => mapping.groupId)
  },
}
