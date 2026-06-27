import { randomUUID } from 'node:crypto'
import { User, UserRole, UserSchema } from '../../../shared/src/index.js'
import { db } from '../db/client.js'

type UserRow = {
  id: string
  email: string
  display_name: string | null
  password_hash: string | null
  role: UserRole
  auth_provider: string
  created_at: string
  updated_at: string
}

export type UserRecord = User & { passwordHash: string | null }

function mapRow(row: UserRow): UserRecord {
  const api = UserSchema.parse({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    authProvider: row.auth_provider,
  })
  return { ...api, passwordHash: row.password_hash }
}

export const userRepository = {
  count(): number {
    const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as {
      count: number
    }
    return row.count
  },

  getByEmail(email: string): UserRecord | null {
    const row = db
      .prepare('SELECT * FROM users WHERE lower(email) = lower(?)')
      .get(email) as UserRow | undefined
    return row ? mapRow(row) : null
  },

  getById(id: string): UserRecord | null {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
      | UserRow
      | undefined
    return row ? mapRow(row) : null
  },

  create(input: {
    email: string
    displayName: string | null
    passwordHash: string | null
    role: UserRole
    authProvider?: string
  }): UserRecord {
    const now = new Date().toISOString()
    const row: UserRow = {
      id: randomUUID(),
      email: input.email,
      display_name: input.displayName,
      password_hash: input.passwordHash,
      role: input.role,
      auth_provider: input.authProvider ?? 'local',
      created_at: now,
      updated_at: now,
    }
    db.prepare(`
      INSERT INTO users (
        id, email, display_name, password_hash, role, auth_provider, created_at, updated_at
      )
      VALUES (@id, @email, @display_name, @password_hash, @role, @auth_provider, @created_at, @updated_at)
    `).run(row)
    return mapRow(row)
  },
}
