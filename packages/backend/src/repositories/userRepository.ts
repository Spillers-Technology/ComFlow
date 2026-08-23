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
  external_id: string | null
  tenant_id: string
  email_verified_at: string | null
  email_verification_token: string | null
  email_verification_expires_at: string | null
  self_registered_at: string | null
  password_reset_token: string | null
  password_reset_expires_at: string | null
  session_epoch: number
  totp_secret: string | null
  totp_enabled_at: string | null
  totp_recovery_codes: string | null
  created_at: string
  updated_at: string
}

export type UserRecord = User & {
  passwordHash: string | null
  externalId: string | null
  emailVerifiedAt: string | null
  emailVerificationExpiresAt: string | null
  selfRegisteredAt: string | null
  passwordResetExpiresAt: string | null
  sessionEpoch: number
  totpSecret: string | null
  /** Null until the user confirms enrollment with a working code. */
  totpEnabledAt: string | null
  /** SHA-256 hashes of the unused single-use recovery codes. */
  totpRecoveryCodes: string[]
}

function mapRow(row: UserRow): UserRecord {
  const api = UserSchema.parse({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    authProvider: row.auth_provider,
    tenantId: row.tenant_id,
    emailVerified: Boolean(row.email_verified_at),
  })
  return {
    ...api,
    passwordHash: row.password_hash,
    externalId: row.external_id,
    emailVerifiedAt: row.email_verified_at,
    emailVerificationExpiresAt: row.email_verification_expires_at,
    selfRegisteredAt: row.self_registered_at,
    passwordResetExpiresAt: row.password_reset_expires_at,
    sessionEpoch: row.session_epoch ?? 0,
    totpSecret: row.totp_secret,
    totpEnabledAt: row.totp_enabled_at,
    totpRecoveryCodes: parseRecoveryCodes(row.totp_recovery_codes),
  }
}

function parseRecoveryCodes(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter(v => typeof v === 'string') : []
  } catch {
    return []
  }
}

export const userRepository = {
  count(): number {
    const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as {
      count: number
    }
    return row.count
  },

  list(tenantId: string): UserRecord[] {
    const rows = db
      .prepare(
        'SELECT * FROM users WHERE tenant_id = ? ORDER BY lower(email) ASC'
      )
      .all(tenantId) as UserRow[]
    return rows.map(mapRow)
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
    tenantId: string
    authProvider?: string
    externalId?: string | null
    // Defaults verified: operator-created, SSO, and bootstrap accounts don't
    // do the verification dance — only self-registration passes false.
    emailVerified?: boolean
    verificationTokenHash?: string | null
    verificationExpiresAt?: string | null
    selfRegistered?: boolean
  }): UserRecord {
    const now = new Date().toISOString()
    const verified = input.emailVerified ?? true
    const row: UserRow = {
      id: randomUUID(),
      email: input.email.trim().toLowerCase(),
      display_name: input.displayName,
      password_hash: input.passwordHash,
      role: input.role,
      auth_provider: input.authProvider ?? 'local',
      external_id: input.externalId ?? null,
      tenant_id: input.tenantId,
      email_verified_at: verified ? now : null,
      email_verification_token: verified
        ? null
        : input.verificationTokenHash ?? null,
      email_verification_expires_at: verified
        ? null
        : input.verificationExpiresAt ?? null,
      self_registered_at: input.selfRegistered ? now : null,
      password_reset_token: null,
      password_reset_expires_at: null,
      session_epoch: 0,
      totp_secret: null,
      totp_enabled_at: null,
      totp_recovery_codes: null,
      created_at: now,
      updated_at: now,
    }
    db.prepare(`
      INSERT INTO users (
        id, email, display_name, password_hash, role, auth_provider, external_id, tenant_id,
        email_verified_at, email_verification_token, email_verification_expires_at,
        self_registered_at, password_reset_token, password_reset_expires_at,
        session_epoch, totp_secret, totp_enabled_at, totp_recovery_codes,
        created_at, updated_at
      )
      VALUES (@id, @email, @display_name, @password_hash, @role, @auth_provider, @external_id, @tenant_id,
        @email_verified_at, @email_verification_token, @email_verification_expires_at,
        @self_registered_at, @password_reset_token, @password_reset_expires_at,
        @session_epoch, @totp_secret, @totp_enabled_at, @totp_recovery_codes,
        @created_at, @updated_at)
    `).run(row)
    return mapRow(row)
  },

  getByVerificationTokenHash(tokenHash: string): UserRecord | null {
    const row = db
      .prepare('SELECT * FROM users WHERE email_verification_token = ?')
      .get(tokenHash) as UserRow | undefined
    return row ? mapRow(row) : null
  },

  setEmailVerification(
    id: string,
    input: { tokenHash: string; expiresAt: string }
  ): void {
    const now = new Date().toISOString()
    db.prepare(`
      UPDATE users
      SET email_verified_at = NULL,
          email_verification_token = ?,
          email_verification_expires_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(input.tokenHash, input.expiresAt, now, id)
  },

  markEmailVerified(id: string): void {
    const now = new Date().toISOString()
    db.prepare(`
      UPDATE users
      SET email_verified_at = ?, email_verification_token = NULL,
          email_verification_expires_at = NULL, updated_at = ?
      WHERE id = ?
    `).run(now, now, id)
  },

  getByPasswordResetTokenHash(tokenHash: string): UserRecord | null {
    const row = db
      .prepare('SELECT * FROM users WHERE password_reset_token = ?')
      .get(tokenHash) as UserRow | undefined
    return row ? mapRow(row) : null
  },

  setPasswordReset(
    id: string,
    input: { tokenHash: string; expiresAt: string }
  ): void {
    const now = new Date().toISOString()
    db.prepare(`
      UPDATE users
      SET password_reset_token = ?,
          password_reset_expires_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(input.tokenHash, input.expiresAt, now, id)
  },

  /** Stores an enrollment secret without switching MFA on. */
  setTotpSecret(id: string, secret: string | null): void {
    db.prepare(`
      UPDATE users
      SET totp_secret = ?, totp_enabled_at = NULL, totp_recovery_codes = NULL,
          updated_at = ?
      WHERE id = ?
    `).run(secret, new Date().toISOString(), id)
  },

  enableTotp(id: string, recoveryCodeHashes: string[]): void {
    const now = new Date().toISOString()
    db.prepare(`
      UPDATE users
      SET totp_enabled_at = ?, totp_recovery_codes = ?, updated_at = ?
      WHERE id = ?
    `).run(now, JSON.stringify(recoveryCodeHashes), now, id)
  },

  setTotpRecoveryCodes(id: string, recoveryCodeHashes: string[]): void {
    db.prepare(
      'UPDATE users SET totp_recovery_codes = ?, updated_at = ? WHERE id = ?'
    ).run(JSON.stringify(recoveryCodeHashes), new Date().toISOString(), id)
  },

  disableTotp(id: string): void {
    db.prepare(`
      UPDATE users
      SET totp_secret = NULL, totp_enabled_at = NULL, totp_recovery_codes = NULL,
          updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), id)
  },

  /** Invalidates every session token already issued for this user. */
  bumpSessionEpoch(id: string): void {
    db.prepare(`
      UPDATE users
      SET session_epoch = session_epoch + 1, updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), id)
  },

  clearPasswordReset(id: string): void {
    const now = new Date().toISOString()
    db.prepare(`
      UPDATE users
      SET password_reset_token = NULL, password_reset_expires_at = NULL,
          updated_at = ?
      WHERE id = ?
    `).run(now, id)
  },

  setRole(id: string, role: UserRole): void {
    db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(
      role,
      new Date().toISOString(),
      id
    )
  },

  update(
    id: string,
    patch: { displayName?: string | null; role?: UserRole }
  ): UserRecord | null {
    const existing = this.getById(id)
    if (!existing) return null
    db.prepare(`
      UPDATE users SET display_name = ?, role = ?, updated_at = ? WHERE id = ?
    `).run(
      patch.displayName !== undefined ? patch.displayName : existing.displayName,
      patch.role ?? existing.role,
      new Date().toISOString(),
      id
    )
    return this.getById(id)
  },

  updateProfile(
    id: string,
    patch: {
      displayName: string | null
      email?: string
      verificationTokenHash?: string
      verificationExpiresAt?: string
    }
  ): UserRecord | null {
    const existing = this.getById(id)
    if (!existing) return null

    db.prepare(`
      UPDATE users
      SET display_name = ?,
          email = ?,
          email_verified_at = CASE WHEN ? IS NULL THEN email_verified_at ELSE NULL END,
          email_verification_token = COALESCE(?, email_verification_token),
          email_verification_expires_at = COALESCE(?, email_verification_expires_at),
          updated_at = ?
      WHERE id = ?
    `).run(
      patch.displayName,
      patch.email?.trim().toLowerCase() ?? existing.email,
      patch.verificationTokenHash ?? null,
      patch.verificationTokenHash ?? null,
      patch.verificationExpiresAt ?? null,
      new Date().toISOString(),
      id
    )

    return this.getById(id)
  },

  setPassword(id: string, passwordHash: string): void {
    db.prepare(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?'
    ).run(passwordHash, new Date().toISOString(), id)
  },

  remove(id: string): boolean {
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(id)
    return result.changes > 0
  },

  /** Admins within a tenant — used by the last-admin guard, scoped per tenant. */
  countAdmins(tenantId: string): number {
    const row = db
      .prepare(
        "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND tenant_id = ?"
      )
      .get(tenantId) as { count: number }
    return row.count
  },

  tenantIsSelfRegistered(tenantId: string): boolean {
    const row = db
      .prepare(`
        SELECT 1 FROM users
        WHERE tenant_id = ? AND self_registered_at IS NOT NULL
        LIMIT 1
      `)
      .get(tenantId)
    return Boolean(row)
  },

  /**
   * Provision (or refresh) a user from an SSO identity, matched by email. New
   * users default to the `member` role; an existing user's role is left alone
   * here (admin promotion via the allowlist happens in the SSO service). Records
   * the external subject id and the originating provider for traceability.
   */
  upsertBySsoIdentity(input: {
    email: string
    displayName: string | null
    externalId: string
    authProvider: string
    tenantId: string
  }): UserRecord {
    const existing = this.getByEmail(input.email)
    if (existing) {
      db.prepare(`
        UPDATE users
        SET display_name = COALESCE(?, display_name),
            external_id = ?,
            auth_provider = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        input.displayName,
        input.externalId,
        input.authProvider,
        new Date().toISOString(),
        existing.id
      )
      return this.getById(existing.id)!
    }

    return this.create({
      email: input.email,
      displayName: input.displayName,
      passwordHash: null,
      role: 'member',
      tenantId: input.tenantId,
      authProvider: input.authProvider,
      externalId: input.externalId,
    })
  },
}
