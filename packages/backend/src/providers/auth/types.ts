import { User } from '../../../../shared/src/index.js'

/**
 * Pluggable authentication. Local accounts implement this today; an OIDC / SAML
 * provider (M2) slots in alongside via {@link SsoProvider} without touching
 * call/inbox code. Mirrors AnchorDesk's auth model so the two products converge.
 */
export interface AuthProvider {
  /** Verify credentials and return the user, or null when they don't match. */
  authenticate(email: string, password: string): Promise<User | null>
}

/** The verified identity an SSO provider returns after a successful round-trip. */
export interface SsoIdentity {
  email: string
  displayName: string | null
  /** Stable subject id from the IdP (OIDC `sub` / SAML nameID). */
  externalId: string
  /** IdP group names, mapped onto ComFlow groups by the SSO service. */
  groups: string[]
}

/** Secrets minted at the start of an SSO login, persisted until the callback. */
export interface SsoStart {
  redirectUrl: string
  state: string
  nonce: string | null
  codeVerifier: string | null
}

export interface SsoCompleteInput {
  /** OIDC: the full callback URL (with the authorization-code query string). */
  callbackUrl?: string
  /** SAML: the parsed ACS POST body (`SAMLResponse`, `RelayState`). */
  body?: Record<string, unknown>
  /** The values persisted by {@link SsoProvider.start}. */
  state: string
  nonce: string | null
  codeVerifier: string | null
}

/**
 * A redirect-based identity provider. Distinct from {@link AuthProvider} because
 * SSO is a browser round-trip (authorize → IdP → callback), not a credential
 * check. The session token minted afterwards is the same HMAC bearer token local
 * logins use, so everything downstream is provider-agnostic.
 */
export interface SsoProvider {
  id: 'oidc' | 'saml'
  label: string
  start(): Promise<SsoStart>
  complete(input: SsoCompleteInput): Promise<SsoIdentity>
}
