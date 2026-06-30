// Search for and provision a DID, binding it to a (new) mailbox. Uses a
// TENANT org-admin token (the DID lands in that token's tenant).
//
//   COMFLOW_TOKEN=<org-admin cf_ key> node scripts/provision-did.mjs \
//     [--search NY] [--number +15551234567] [--mailbox-name "Front desk"]
//
// With --number, that exact number is ordered. With --search (or nothing), the
// first available number from the provider is ordered.
import { api, parseArgs, requireEnvToken } from './lib.mjs'

requireEnvToken()
const { flags } = parseArgs()

let number = flags.number
if (!number) {
  const query = typeof flags.search === 'string' ? `&query=${encodeURIComponent(flags.search)}` : ''
  const { items } = await api('GET', `/api/dids/search?country=US${query}`)
  if (!items.length) {
    console.error('No DIDs available from the provider for that search.')
    process.exit(1)
  }
  number = items[0].number
  console.log(`Selected ${number} (${items[0].monthlyCents}c/mo, ${items[0].perMinuteCents}c/min)`)
}

const { did } = await api('POST', '/api/dids', {
  number,
  ...(flags['mailbox-name'] ? { mailboxName: flags['mailbox-name'] } : {}),
})

console.log(`Provisioned ${did.number} → mailbox ${did.mailboxId}`)
console.log('Forward the customer’s line to this number; voicemails appear under their sign-in.')
