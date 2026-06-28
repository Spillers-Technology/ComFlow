import {
  CreateMailboxRequest,
  Mailbox,
  UpdateMailboxRequest,
} from '../../../shared/src/index.js'
import { config } from '../config.js'
import { HttpError } from '../lib/errors.js'
import { callRepository } from '../repositories/callRepository.js'
import { mailboxRepository } from '../repositories/mailboxRepository.js'

/**
 * Mailboxes are a first-class entity. Inbound calls are routed to one by the
 * dialed DID or receiving SIP account (see {@link resolveInbound}); RBAC groups
 * grant visibility per mailbox.
 */
export class MailboxService {
  list(): Mailbox[] {
    return mailboxRepository.list()
  }

  getDefault(): Mailbox {
    return mailboxRepository.ensureDefault(config.defaultMailbox)
  }

  create(input: CreateMailboxRequest): Mailbox {
    return mailboxRepository.create({
      name: input.name,
      number: input.number ?? null,
      sipAccountRef: input.sipAccountRef ?? null,
      greetingPromptId: input.greetingPromptId ?? null,
    })
  }

  update(id: string, patch: UpdateMailboxRequest): Mailbox {
    const mailbox = mailboxRepository.update(id, patch)
    if (!mailbox) {
      throw new HttpError(404, 'Mailbox not found.')
    }
    return mailbox
  }

  /** Delete a mailbox; its calls fall back to the default. Never the last one. */
  remove(id: string): void {
    const mailbox = mailboxRepository.getById(id)
    if (!mailbox) {
      throw new HttpError(404, 'Mailbox not found.')
    }
    if (mailboxRepository.count() <= 1) {
      throw new HttpError(400, 'Cannot delete the only mailbox.')
    }
    const fallback = mailboxRepository
      .list()
      .find(other => other.id !== id)
    callRepository.reassignMailbox(id, fallback?.id ?? null)
    mailboxRepository.remove(id)
  }

  /**
   * Resolve which mailbox an inbound call lands in. Total + deterministic:
   * dialed DID (`toNumber` → `mailboxes.number`) → receiving SIP account
   * (`accountLabel` → `mailboxes.sipAccountRef`) → the default mailbox. An
   * absent or unknown key always falls back to default, so routing is safe even
   * before per-mailbox DIDs are configured.
   */
  resolveInbound(input: {
    toNumber?: string | null
    accountLabel?: string | null
  }): string {
    if (input.toNumber) {
      const byNumber = mailboxRepository.getByNumber(input.toNumber)
      if (byNumber) return byNumber.id
    }
    if (input.accountLabel) {
      const byAccount = mailboxRepository.getBySipAccountRef(input.accountLabel)
      if (byAccount) return byAccount.id
    }
    return this.getDefault().id
  }
}
