import { SipSettings, SipSettingsSchema } from '../../../shared/src/index.js'
import { db } from '../db/client.js'

type SipSettingsRow = {
  enabled: number
  account_label: string
  account_uri: string | null
  auth_username: string | null
  outbound_proxy: string | null
  outbound_dialing_domain: string | null
  registration_interval: number
  preferred_codecs_json: string
}

function parsePreferredCodecs(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function mapSettings(row: SipSettingsRow): SipSettings {
  return SipSettingsSchema.parse({
    enabled: Boolean(row.enabled),
    accountLabel: row.account_label,
    accountUri: row.account_uri,
    authUsername: row.auth_username,
    outboundProxy: row.outbound_proxy,
    outboundDialingDomain: row.outbound_dialing_domain,
    registrationInterval: row.registration_interval,
    preferredCodecs: parsePreferredCodecs(row.preferred_codecs_json),
  })
}

export const sipSettingsRepository = {
  get(): SipSettings | null {
    const row = db.prepare('SELECT * FROM sip_settings WHERE id = 1').get() as
      | SipSettingsRow
      | undefined
    return row ? mapSettings(row) : null
  },

  upsert(settings: SipSettings): SipSettings {
    const value = SipSettingsSchema.parse(settings)
    db.prepare(`
      INSERT INTO sip_settings (
        id, enabled, account_label, account_uri, auth_username, outbound_proxy,
        outbound_dialing_domain, registration_interval, preferred_codecs_json,
        updated_at
      )
      VALUES (
        1, @enabled, @account_label, @account_uri, @auth_username,
        @outbound_proxy, @outbound_dialing_domain, @registration_interval,
        @preferred_codecs_json, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        enabled = excluded.enabled,
        account_label = excluded.account_label,
        account_uri = excluded.account_uri,
        auth_username = excluded.auth_username,
        outbound_proxy = excluded.outbound_proxy,
        outbound_dialing_domain = excluded.outbound_dialing_domain,
        registration_interval = excluded.registration_interval,
        preferred_codecs_json = excluded.preferred_codecs_json,
        updated_at = excluded.updated_at
    `).run({
      enabled: value.enabled ? 1 : 0,
      account_label: value.accountLabel,
      account_uri: value.accountUri,
      auth_username: value.authUsername,
      outbound_proxy: value.outboundProxy,
      outbound_dialing_domain: value.outboundDialingDomain,
      registration_interval: value.registrationInterval,
      preferred_codecs_json: JSON.stringify(value.preferredCodecs),
      updated_at: new Date().toISOString(),
    })

    return value
  },
}
