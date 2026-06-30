import { randomUUID } from 'node:crypto'
import {
  Mailbox,
  MailboxSchema,
  UpdateMailboxRequest,
} from '../../../shared/src/index.js'
import { db } from '../db/client.js'

type MailboxRow = {
  id: string
  name: string
  number: string | null
  greeting_prompt_id: string | null
  sip_account_ref: string | null
  tenant_id: string | null
  created_at: string
  updated_at: string
}

type MailboxDefaults = {
  name: string
  number: string | null
  sipAccountRef: string | null
}

/** The tenant a mailbox belongs to (used to stamp inbound calls). */
export function mailboxTenantId(id: string): string | null {
  const row = db
    .prepare('SELECT tenant_id FROM mailboxes WHERE id = ?')
    .get(id) as { tenant_id: string | null } | undefined
  return row?.tenant_id ?? null
}

function mapRow(row: MailboxRow): Mailbox {
  return MailboxSchema.parse({
    id: row.id,
    name: row.name,
    number: row.number,
    greetingPromptId: row.greeting_prompt_id,
    sipAccountRef: row.sip_account_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export const mailboxRepository = {
  list(tenantId: string): Mailbox[] {
    const rows = db
      .prepare(
        'SELECT * FROM mailboxes WHERE tenant_id = ? ORDER BY datetime(created_at) ASC'
      )
      .all(tenantId) as MailboxRow[]
    return rows.map(mapRow)
  },

  getById(id: string): Mailbox | null {
    const row = db.prepare('SELECT * FROM mailboxes WHERE id = ?').get(id) as
      | MailboxRow
      | undefined
    return row ? mapRow(row) : null
  },

  count(tenantId: string): number {
    const row = db
      .prepare('SELECT COUNT(*) as count FROM mailboxes WHERE tenant_id = ?')
      .get(tenantId) as { count: number }
    return row.count
  },

  getByNumber(number: string): Mailbox | null {
    const row = db
      .prepare('SELECT * FROM mailboxes WHERE number = ?')
      .get(number) as MailboxRow | undefined
    return row ? mapRow(row) : null
  },

  getBySipAccountRef(sipAccountRef: string): Mailbox | null {
    const row = db
      .prepare('SELECT * FROM mailboxes WHERE sip_account_ref = ?')
      .get(sipAccountRef) as MailboxRow | undefined
    return row ? mapRow(row) : null
  },

  create(input: {
    name: string
    number: string | null
    sipAccountRef: string | null
    greetingPromptId: string | null
    tenantId: string
  }): Mailbox {
    const now = new Date().toISOString()
    const row: MailboxRow = {
      id: randomUUID(),
      name: input.name,
      number: input.number,
      greeting_prompt_id: input.greetingPromptId,
      sip_account_ref: input.sipAccountRef,
      tenant_id: input.tenantId,
      created_at: now,
      updated_at: now,
    }
    db.prepare(`
      INSERT INTO mailboxes (
        id, name, number, greeting_prompt_id, sip_account_ref, tenant_id, created_at, updated_at
      )
      VALUES (@id, @name, @number, @greeting_prompt_id, @sip_account_ref, @tenant_id, @created_at, @updated_at)
    `).run(row)
    return mapRow(row)
  },

  remove(id: string): boolean {
    const result = db.prepare('DELETE FROM mailboxes WHERE id = ?').run(id)
    return result.changes > 0
  },

  /** A tenant's default mailbox; the earliest-created one in that tenant. */
  getDefault(tenantId: string): Mailbox | null {
    const row = db
      .prepare(
        'SELECT * FROM mailboxes WHERE tenant_id = ? ORDER BY datetime(created_at) ASC LIMIT 1'
      )
      .get(tenantId) as MailboxRow | undefined
    return row ? mapRow(row) : null
  },

  /** Create a tenant's default mailbox on first need so calls have a home. */
  ensureDefault(defaults: MailboxDefaults, tenantId: string): Mailbox {
    const existing = this.getDefault(tenantId)
    if (existing) return existing

    const now = new Date().toISOString()
    const row: MailboxRow = {
      id: randomUUID(),
      name: defaults.name,
      number: defaults.number,
      greeting_prompt_id: null,
      sip_account_ref: defaults.sipAccountRef,
      tenant_id: tenantId,
      created_at: now,
      updated_at: now,
    }
    db.prepare(`
      INSERT INTO mailboxes (
        id, name, number, greeting_prompt_id, sip_account_ref, tenant_id, created_at, updated_at
      )
      VALUES (@id, @name, @number, @greeting_prompt_id, @sip_account_ref, @tenant_id, @created_at, @updated_at)
    `).run(row)
    return mapRow(row)
  },

  update(id: string, patch: UpdateMailboxRequest): Mailbox | null {
    const existing = this.getById(id)
    if (!existing) return null

    db.prepare(`
      UPDATE mailboxes
      SET name = ?, number = ?, greeting_prompt_id = ?, sip_account_ref = ?, updated_at = ?
      WHERE id = ?
    `).run(
      patch.name ?? existing.name,
      patch.number !== undefined ? patch.number : existing.number,
      patch.greetingPromptId !== undefined
        ? patch.greetingPromptId
        : existing.greetingPromptId,
      patch.sipAccountRef !== undefined
        ? patch.sipAccountRef
        : existing.sipAccountRef,
      new Date().toISOString(),
      id
    )

    return this.getById(id)
  },
}
