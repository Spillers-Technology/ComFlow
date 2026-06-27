import { Mailbox, UpdateMailboxRequest } from '../../../shared/src/index.js'
import { config } from '../config.js'
import { HttpError } from '../lib/errors.js'
import { mailboxRepository } from '../repositories/mailboxRepository.js'

/**
 * Mailboxes are a first-class entity even though the current product ships a
 * single one. Modeling them now (and keying calls by mailbox) makes the
 * multi-mailbox milestone (M3) an additive change rather than a refactor.
 */
export class MailboxService {
  list(): Mailbox[] {
    return mailboxRepository.list()
  }

  getDefault(): Mailbox {
    return mailboxRepository.ensureDefault(config.defaultMailbox)
  }

  update(id: string, patch: UpdateMailboxRequest): Mailbox {
    const mailbox = mailboxRepository.update(id, patch)
    if (!mailbox) {
      throw new HttpError(404, 'Mailbox not found.')
    }
    return mailbox
  }
}
