import * as client from 'openid-client'
import { HttpError } from '../../lib/errors.js'
import { SsoCompleteInput, SsoIdentity, SsoProvider, SsoStart } from './types.js'

export interface OidcConfig {
  issuerUrl: string
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string
  groupsClaim: string
  label: string
}

function toGroups(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string' && value.length > 0) return [value]
  return []
}

export class OidcAuthProvider implements SsoProvider {
  readonly id = 'oidc' as const
  readonly label: string

  // Discovery is network-bound; cache the Configuration promise so we only hit
  // the IdP's well-known endpoint once per process.
  private configuration: Promise<client.Configuration> | null = null

  constructor(private readonly settings: OidcConfig) {
    this.label = settings.label
  }

  private getConfiguration(): Promise<client.Configuration> {
    if (!this.configuration) {
      const insecure = this.settings.issuerUrl.startsWith('http://')
      this.configuration = client.discovery(
        new URL(this.settings.issuerUrl),
        this.settings.clientId,
        this.settings.clientSecret,
        undefined,
        insecure ? { execute: [client.allowInsecureRequests] } : undefined
      )
    }
    return this.configuration
  }

  async start(): Promise<SsoStart> {
    const config = await this.getConfiguration()
    const codeVerifier = client.randomPKCECodeVerifier()
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier)
    const state = client.randomState()
    const nonce = client.randomNonce()

    const redirectUrl = client.buildAuthorizationUrl(config, {
      redirect_uri: this.settings.redirectUri,
      scope: this.settings.scopes,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    })

    return { redirectUrl: redirectUrl.href, state, nonce, codeVerifier }
  }

  async complete(input: SsoCompleteInput): Promise<SsoIdentity> {
    if (!input.callbackUrl) {
      throw new HttpError(400, 'Missing OIDC callback URL.')
    }
    const config = await this.getConfiguration()

    const tokens = await client.authorizationCodeGrant(
      config,
      new URL(input.callbackUrl),
      {
        pkceCodeVerifier: input.codeVerifier ?? undefined,
        expectedState: input.state,
        expectedNonce: input.nonce ?? undefined,
      }
    )

    const claims = (tokens.claims() ?? {}) as Record<string, unknown>
    const sub = typeof claims.sub === 'string' ? claims.sub : null
    let email = typeof claims.email === 'string' ? claims.email : null
    let displayName =
      (typeof claims.name === 'string' && claims.name) ||
      (typeof claims.preferred_username === 'string' &&
        claims.preferred_username) ||
      null
    let groups = toGroups(claims[this.settings.groupsClaim])

    // Some IdPs surface email/groups only from the userinfo endpoint.
    if ((!email || groups.length === 0) && sub && tokens.access_token) {
      try {
        const info = await client.fetchUserInfo(config, tokens.access_token, sub)
        email = email ?? (typeof info.email === 'string' ? info.email : null)
        displayName =
          displayName ?? (typeof info.name === 'string' ? info.name : null)
        if (groups.length === 0) {
          groups = toGroups(
            (info as Record<string, unknown>)[this.settings.groupsClaim]
          )
        }
      } catch {
        // Userinfo is best-effort enrichment; the ID token already authenticated.
      }
    }

    if (!email) {
      throw new HttpError(400, 'OIDC response did not include an email address.')
    }

    return {
      email,
      displayName,
      externalId: sub ?? email,
      groups,
    }
  }
}
