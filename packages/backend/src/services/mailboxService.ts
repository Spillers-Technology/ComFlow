import {
  CreateMailboxRequest,
  Mailbox,
  UpdateMailboxRequest,
} from '../../../shared/src/index.js'
import { config } from '../config.js'
import { ensurePrimaryTenant } from '../db/client.js'
import { HttpError } from '../lib/errors.js'
import { callRepository } from '../repositories/callRepository.js'
import {
  mailboxRepository,
  mailboxTenantId,
} from '../repositories/mailboxRepository.js'

export type InboundRouting = { mailboxId: string; tenantId: string }

/**
 * Mailboxes are a first-class, tenant-owned entity. Inbound calls are routed to
 * one by the dialed DID or receiving SIP account (see {@link resolveInbound}),
 * which also resolves the owning tenant; RBAC groups grant visibility per
 * mailbox within a tenant.
 */
export class MailboxService {
  list(tenantId: string): Mailbox[] {
    return mailboxRepository.list(tenantId)
  }

  getDefault(tenantId: string): Mailbox {
    return mailboxRepository.ensureDefault(config.defaultMailbox, tenantId)
  }

  create(input: CreateMailboxRequest, tenantId: string): Mailbox {
    return mailboxRepository.create({
      name: input.name,
      number: input.number ?? null,
      sipAccountRef: input.sipAccountRef ?? null,
      greetingPromptId: input.greetingPromptId ?? null,
      tenantId,
    })
  }

  /** Update a mailbox, ensuring it belongs to the caller's tenant. */
  update(id: string, patch: UpdateMailboxRequest, tenantId: string): Mailbox {
    const existing = mailboxRepository.getById(id)
    if (!existing || !this.belongsToTenant(id, tenantId)) {
      throw new HttpError(404, 'Mailbox not found.')
    }
    const mailbox = mailboxRepository.update(id, patch)
    if (!mailbox) {
      throw new HttpError(404, 'Mailbox not found.')
    }
    return mailbox
  }

  /** Delete a mailbox; its calls fall back to the tenant default. Never the last. */
  remove(id: string, tenantId: string): void {
    const mailbox = mailboxRepository.getById(id)
    if (!mailbox || !this.belongsToTenant(id, tenantId)) {
      throw new HttpError(404, 'Mailbox not found.')
    }
    if (mailboxRepository.count(tenantId) <= 1) {
      throw new HttpError(400, 'Cannot delete the only mailbox.')
    }
    const fallback = mailboxRepository
      .list(tenantId)
      .find(other => other.id !== id)
    callRepository.reassignMailbox(id, fallback?.id ?? null)
    mailboxRepository.remove(id)
  }

  private belongsToTenant(id: string, tenantId: string): boolean {
    return mailboxRepository.list(tenantId).some(mailbox => mailbox.id === id)
  }

  /**
   * Resolve which mailbox (and tenant) an inbound call lands in. Total +
   * deterministic: dialed DID (`toNumber` → `mailboxes.number`) → receiving SIP
   * account (`accountLabel` → `mailboxes.sipAccountRef`) → the primary tenant's
   * default mailbox. DIDs are globally unique, so a matched DID also pins the
   * owning tenant. An absent or unknown key falls back to the primary tenant.
   */
  resolveInbound(input: {
    toNumber?: string | null
    accountLabel?: string | null
  }): InboundRouting {
    if (input.toNumber) {
      const byNumber = mailboxRepository.getByNumber(input.toNumber)
      if (byNumber) return this.routeFor(byNumber)
    }
    if (input.accountLabel) {
      const byAccount = mailboxRepository.getBySipAccountRef(input.accountLabel)
      if (byAccount) return this.routeFor(byAccount)
    }
    const primaryTenantId = ensurePrimaryTenant(config.defaultTenant)
    return this.routeFor(this.getDefault(primaryTenantId))
  }

  private routeFor(mailbox: Mailbox): InboundRouting {
    const tenantId = mailboxTenantId(mailbox.id)
    return {
      mailboxId: mailbox.id,
      tenantId: tenantId ?? ensurePrimaryTenant(config.defaultTenant),
    }
  }
}
