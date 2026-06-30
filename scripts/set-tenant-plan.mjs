// Update a tenant's plan limits/pricing. Requires an OWNER token.
//
//   COMFLOW_TOKEN=<owner cf_ key> node scripts/set-tenant-plan.mjs <tenantId> \
//     [--max-dids 3] [--max-concurrent 5] [--included-minutes 500] [--markup-bps 15000]
import { api, parseArgs, requireEnvToken, die } from './lib.mjs'

requireEnvToken()
const { flags, positionals } = parseArgs()
const tenantId = positionals[0]
if (!tenantId) die('Usage: set-tenant-plan.mjs <tenantId> [--max-dids N] ...')

const patch = {}
if (flags['max-dids']) patch.maxDids = Number(flags['max-dids'])
if (flags['max-concurrent']) patch.maxConcurrentCalls = Number(flags['max-concurrent'])
if (flags['included-minutes']) patch.includedMinutes = Number(flags['included-minutes'])
if (flags['markup-bps']) patch.markupBps = Number(flags['markup-bps'])
if (!Object.keys(patch).length) die('Provide at least one limit flag to change.')

const { limits } = await api('PATCH', `/api/tenants/${tenantId}/limits`, patch)
console.log('Updated limits:', limits)
