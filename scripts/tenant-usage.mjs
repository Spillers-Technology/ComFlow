// Print the current tenant's usage breakdown and wallet balance. Uses a TENANT
// token (owner or org-admin of that tenant).
//
//   COMFLOW_TOKEN=<cf_ key> node scripts/tenant-usage.mjs
import { api, requireEnvToken } from './lib.mjs'

requireEnvToken()

const { summary } = await api('GET', '/api/usage')
const { wallet } = await api('GET', '/api/billing')

const dollars = cents => `$${(cents / 100).toFixed(2)}`

console.log(`Usage for ${summary.month}`)
console.log('  type            qty     carrier     billed')
for (const line of summary.lines) {
  console.log(
    `  ${line.type.padEnd(15)} ${String(line.quantity).padStart(5)}  ` +
      `${dollars(line.carrierCents).padStart(9)}  ${dollars(line.billedCents).padStart(9)}`
  )
}
console.log(`  ${'TOTAL'.padEnd(15)} ${''.padStart(5)}  ` +
  `${dollars(summary.totalCarrierCents).padStart(9)}  ${dollars(summary.totalBilledCents).padStart(9)}`)

console.log('\nLimits:', summary.limits)
console.log('\nWallet')
console.log(`  credit  ${dollars(wallet.creditCents)}`)
console.log(`  billed  ${dollars(wallet.billedCents)}`)
console.log(`  balance ${dollars(wallet.balanceCents)}`)
