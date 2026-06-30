import { randomUUID } from 'node:crypto'
import { Tenant, TenantSchema, TenantStatus } from '../../../shared/src/index.js'
import { db } from '../db/client.js'

type TenantRow = {
  id: string
  name: string
  slug: string
  plan: string
  status: TenantStatus
  created_at: string
  updated_at: string
}

function mapRow(row: TenantRow): Tenant {
  return TenantSchema.parse({
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export const tenantRepository = {
  list(): Tenant[] {
    const rows = db
      .prepare('SELECT * FROM tenants ORDER BY datetime(created_at) ASC')
      .all() as TenantRow[]
    return rows.map(mapRow)
  },

  getById(id: string): Tenant | null {
    const row = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id) as
      | TenantRow
      | undefined
    return row ? mapRow(row) : null
  },

  getBySlug(slug: string): Tenant | null {
    const row = db.prepare('SELECT * FROM tenants WHERE slug = ?').get(slug) as
      | TenantRow
      | undefined
    return row ? mapRow(row) : null
  },

  /** The earliest-created tenant — the "primary" tenant in single-tenant mode. */
  getPrimary(): Tenant | null {
    const row = db
      .prepare('SELECT * FROM tenants ORDER BY datetime(created_at) ASC LIMIT 1')
      .get() as TenantRow | undefined
    return row ? mapRow(row) : null
  },

  create(input: { name: string; slug: string; plan?: string }): Tenant {
    const now = new Date().toISOString()
    const row: TenantRow = {
      id: randomUUID(),
      name: input.name,
      slug: input.slug,
      plan: input.plan ?? 'free',
      status: 'active',
      created_at: now,
      updated_at: now,
    }
    db.prepare(`
      INSERT INTO tenants (id, name, slug, plan, status, created_at, updated_at)
      VALUES (@id, @name, @slug, @plan, @status, @created_at, @updated_at)
    `).run(row)
    return mapRow(row)
  },

  update(
    id: string,
    patch: { name?: string; plan?: string; status?: TenantStatus }
  ): Tenant | null {
    const existing = this.getById(id)
    if (!existing) return null
    db.prepare(`
      UPDATE tenants SET name = ?, plan = ?, status = ?, updated_at = ? WHERE id = ?
    `).run(
      patch.name ?? existing.name,
      patch.plan ?? existing.plan,
      patch.status ?? existing.status,
      new Date().toISOString(),
      id
    )
    return this.getById(id)
  },
}
