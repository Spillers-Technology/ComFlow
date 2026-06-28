import { LoginResponse, SsoProviderInfo } from '../../../shared/src/index.js'
import { config } from '../config.js'
import { HttpError } from '../lib/errors.js'
import { signSessionToken } from '../lib/token.js'
import { getSsoProviders } from '../providers/auth/ssoProviders.js'
import { SsoProvider } from '../providers/auth/types.js'
import { groupRepository } from '../repositories/groupRepository.js'
import { ssoStateRepository } from '../repositories/ssoStateRepository.js'
import { userRepository } from '../repositories/userRepository.js'
import { toApiUser } from './authService.js'

export class SsoService {
  private readonly providers: Map<string, SsoProvider>

  constructor(providers: SsoProvider[] = getSsoProviders()) {
    this.providers = new Map(providers.map(provider => [provider.id, provider]))
  }

  listProviderInfo(): SsoProviderInfo[] {
    return [...this.providers.values()].map(provider => ({
      id: provider.id,
      label: provider.label,
    }))
  }

  hasProviders(): boolean {
    return this.providers.size > 0
  }

  private getProvider(id: string): SsoProvider {
    const provider = this.providers.get(id)
    if (!provider) {
      throw new HttpError(404, `Unknown SSO provider: ${id}`)
    }
    return provider
  }

  /** Begin a login: persist the transient state and return the IdP redirect. */
  async start(providerId: string): Promise<string> {
    const provider = this.getProvider(providerId)
    const started = await provider.start()
    ssoStateRepository.create({
      state: started.state,
      provider: provider.id,
      nonce: started.nonce,
      codeVerifier: started.codeVerifier,
    })
    return started.redirectUrl
  }

  /**
   * Finish a login: validate the IdP response, JIT-provision the user, apply the
   * admin allowlist (promotion-only), sync mapped groups, and mint a session.
   */
  async complete(
    providerId: string,
    input: { callbackUrl?: string; body?: Record<string, unknown>; state: string }
  ): Promise<LoginResponse> {
    const provider = this.getProvider(providerId)

    const persisted = ssoStateRepository.consume(input.state)
    if (!persisted || persisted.provider !== provider.id) {
      throw new HttpError(400, 'Invalid or expired SSO state.')
    }

    const identity = await provider.complete({
      callbackUrl: input.callbackUrl,
      body: input.body,
      state: input.state,
      nonce: persisted.nonce,
      codeVerifier: persisted.codeVerifier,
    })

    const user = userRepository.upsertBySsoIdentity({
      email: identity.email,
      displayName: identity.displayName,
      externalId: identity.externalId,
      authProvider: provider.id,
    })

    // Promote allowlisted emails to admin on every login; never demote here.
    if (
      user.role !== 'admin' &&
      config.auth.adminEmails.includes(identity.email.toLowerCase())
    ) {
      userRepository.setRole(user.id, 'admin')
    }

    // Sync membership for any IdP groups mapped to ComFlow groups (additive —
    // we don't remove memberships an admin assigned by hand).
    for (const groupId of groupRepository.groupIdsForExternalNames(
      identity.groups
    )) {
      groupRepository.addMember(groupId, user.id)
    }

    const refreshed = userRepository.getById(user.id)!
    return { token: signSessionToken(refreshed.id), user: toApiUser(refreshed) }
  }
}
