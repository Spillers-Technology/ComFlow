import { Mailbox, User } from '../../../shared/src/index.js'
import { groupRepository } from '../repositories/groupRepository.js'

// Returned for admins (and open-mode), who are not scoped to any subset.
export const ALL_MAILBOXES = 'all' as const
export type MailboxScope = typeof ALL_MAILBOXES | string[]

/**
 * Resolves which mailboxes a user may see *within their tenant*. Tenant
 * isolation is enforced separately at the repository layer; this layer answers
 * the within-tenant RBAC question. Org-admins (and the platform owner, and the
 * open-mode synthetic identity) see every mailbox in their tenant; members see
 * only the union of mailboxes granted by their groups. A member in no group sees
 * nothing — the safe default.
 */
export const accessService = {
  accessibleMailboxIds(user: User): MailboxScope {
    if (user.role === 'admin' || user.role === 'owner') return ALL_MAILBOXES
    return groupRepository.mailboxIdsForUser(user.id)
  },

  canAccessMailbox(user: User, mailboxId: string | null): boolean {
    const scope = this.accessibleMailboxIds(user)
    if (scope === ALL_MAILBOXES) return true
    return mailboxId !== null && scope.includes(mailboxId)
  },

  filterMailboxes(user: User, mailboxes: Mailbox[]): Mailbox[] {
    const scope = this.accessibleMailboxIds(user)
    if (scope === ALL_MAILBOXES) return mailboxes
    const allowed = new Set(scope)
    return mailboxes.filter(mailbox => allowed.has(mailbox.id))
  },
}
