import { config } from '../../config.js'
import { OidcAuthProvider } from './oidc.js'
import { SamlAuthProvider } from './saml.js'
import { SsoProvider } from './types.js'

/**
 * Build the SSO providers that are fully configured. Construction is cheap —
 * OIDC discovery is deferred until the first login — so this is safe to call at
 * startup even when the IdP is unreachable.
 */
export function getSsoProviders(): SsoProvider[] {
  const providers: SsoProvider[] = []
  const { oidc, saml } = config.auth

  if (oidc.enabled) {
    providers.push(
      new OidcAuthProvider({
        issuerUrl: oidc.issuerUrl!,
        clientId: oidc.clientId!,
        clientSecret: oidc.clientSecret!,
        redirectUri: oidc.redirectUri!,
        scopes: oidc.scopes,
        groupsClaim: oidc.groupsClaim,
        label: oidc.label,
      })
    )
  }

  if (saml.enabled) {
    providers.push(
      new SamlAuthProvider({
        entryPoint: saml.entryPoint!,
        issuer: saml.issuer!,
        idpCert: saml.idpCert!,
        callbackUrl: saml.callbackUrl!,
        groupsAttribute: saml.groupsAttribute,
        label: saml.label,
      })
    )
  }

  return providers
}
