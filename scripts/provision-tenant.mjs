// Create a tenant and seed its first org-admin. Requires an OWNER token.
//
//   COMFLOW_TOKEN=<owner cf_ key> node scripts/provision-tenant.mjs \
//     --name "Acme Co" --admin-email admin@acme.test --admin-password 'changeme123' \
//     [--plan team] [--slug acme] [--max-dids 3] [--max-concurrent 5] \
//     [--included-minutes 500] [--markup-bps 15000]
//
// Idempotent on slug: if the tenant already exists it is reused.
import { api, parseArgs, requireEnvToken, die } from './lib.mjs'

requireEnvToken()
const { flags } = parseArgs()
if (!flags.name) die('Required: --name')

async function findTenantBySlug(slug) {
  const { items } = await api('GET', '/api/tenants')
  return items.find(t => t.slug === slug) ?? null
}

const slug = flags.slug ?? String(flags.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')
let tenant = await findTenantBySlug(slug)
if (tenant) {
  console.log(`Tenant already exists: ${tenant.name} (${tenant.id})`)
} else {
  ;({ tenant } = await api('POST', '/api/tenants', {
    name: flags.name,
    slug,
    ...(flags.plan ? { plan: flags.plan } : {}),
  }))
  console.log(`Created tenant ${tenant.name} (${tenant.id})`)
}

const limitsPatch = {}
if (flags['max-dids']) limitsPatch.maxDids = Number(flags['max-dids'])
if (flags['max-concurrent']) limitsPatch.maxConcurrentCalls = Number(flags['max-concurrent'])
if (flags['included-minutes']) limitsPatch.includedMinutes = Number(flags['included-minutes'])
if (flags['markup-bps']) limitsPatch.markupBps = Number(flags['markup-bps'])
if (Object.keys(limitsPatch).length) {
  const { limits } = await api('PATCH', `/api/tenants/${tenant.id}/limits`, limitsPatch)
  console.log('Set limits:', limits)
}

if (flags['admin-email'] && flags['admin-password']) {
  try {
    const { user } = await api('POST', `/api/tenants/${tenant.id}/users`, {
      email: flags['admin-email'],
      password: flags['admin-password'],
      displayName: flags['admin-name'] ?? null,
      role: 'admin',
    })
    console.log(`Created org-admin ${user.email} (${user.id})`)
  } catch (error) {
    if (String(error.message).includes('already exists')) {
      console.log(`Org-admin ${flags['admin-email']} already exists — skipping.`)
    } else {
      throw error
    }
  }
}

console.log('\nNext: have the org-admin sign in, create a cf_ API key (Profile),')
console.log('top up the wallet, then run scripts/provision-did.mjs with their key.')
