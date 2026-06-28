import { randomBytes } from 'node:crypto'
import { SAML, SamlConfig } from '@node-saml/node-saml'
import { HttpError } from '../../lib/errors.js'
import { SsoCompleteInput, SsoIdentity, SsoProvider, SsoStart } from './types.js'

export interface SamlSettings {
  entryPoint: string
  issuer: string
  idpCert: string
  callbackUrl: string
  groupsAttribute: string
  label: string
}

// Common attribute names IdPs use for email, tried in order before nameID.
const EMAIL_ATTRIBUTES = [
  'email',
  'mail',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
]
const NAME_ATTRIBUTES = [
  'displayName',
  'name',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
]

function firstString(
  source: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.length > 0) return value
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  }
  return null
}

function toGroups(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string' && value.length > 0) return [value]
  return []
}

export class SamlAuthProvider implements SsoProvider {
  readonly id = 'saml' as const
  readonly label: string
  private readonly saml: SAML

  constructor(private readonly settings: SamlSettings) {
    this.label = settings.label
    const config: SamlConfig = {
      callbackUrl: settings.callbackUrl,
      entryPoint: settings.entryPoint,
      issuer: settings.issuer,
      idpCert: settings.idpCert,
      // Require the assertion to be signed (Authentik's default); we carry our
      // own CSRF state in RelayState rather than tracking InResponseTo ids.
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: false,
      validateInResponseTo: 'never' as SamlConfig['validateInResponseTo'],
      audience: false,
    }
    this.saml = new SAML(config)
  }

  async start(): Promise<SsoStart> {
    const state = randomState()
    // RelayState carries our state through the IdP round-trip.
    const redirectUrl = await this.saml.getAuthorizeUrlAsync(state, undefined, {})
    return { redirectUrl, state, nonce: null, codeVerifier: null }
  }

  async complete(input: SsoCompleteInput): Promise<SsoIdentity> {
    const samlResponse = input.body?.SAMLResponse
    if (typeof samlResponse !== 'string') {
      throw new HttpError(400, 'Missing SAML response.')
    }

    const relayState =
      typeof input.body?.RelayState === 'string' ? input.body.RelayState : ''
    if (relayState !== input.state) {
      throw new HttpError(400, 'SAML RelayState mismatch.')
    }

    const { profile } = await this.saml.validatePostResponseAsync({
      SAMLResponse: samlResponse,
      RelayState: relayState,
    })
    if (!profile) {
      throw new HttpError(401, 'SAML assertion could not be validated.')
    }

    const record = profile as unknown as Record<string, unknown>
    const nameId = typeof record.nameID === 'string' ? record.nameID : null
    const email =
      firstString(record, EMAIL_ATTRIBUTES) ??
      (nameId && nameId.includes('@') ? nameId : null)
    if (!email) {
      throw new HttpError(400, 'SAML assertion did not include an email address.')
    }

    return {
      email,
      displayName: firstString(record, NAME_ATTRIBUTES),
      externalId: nameId ?? email,
      groups: toGroups(record[this.settings.groupsAttribute]),
    }
  }
}

// node-saml doesn't expose a state generator; a URL-safe random token suffices.
function randomState(): string {
  return randomBytes(24).toString('base64url')
}
