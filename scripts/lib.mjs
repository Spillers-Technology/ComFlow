// Tiny shared helper for the ComFlow operator scripts. Configure with env:
//   COMFLOW_URL    base URL of the API (default http://localhost:3001)
//   COMFLOW_TOKEN  a Bearer token — an owner or org-admin `cf_` API key
//
// Each script is thin and idempotent where it can be; they drive the same REST
// API the UI uses, so anything here is also doable by hand.

const BASE = (process.env.COMFLOW_URL ?? 'http://localhost:3001').replace(/\/$/, '')
const TOKEN = process.env.COMFLOW_TOKEN ?? ''

export async function api(method, path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  const json = text ? JSON.parse(text) : null
  if (!response.ok) {
    const message = json?.error ?? `${response.status} ${response.statusText}`
    throw new Error(`${method} ${path} failed: ${message}`)
  }
  return json
}

/** Parse `--flag value` pairs and bare positionals from argv. */
export function parseArgs(argv = process.argv.slice(2)) {
  const flags = {}
  const positionals = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        flags[key] = next
        i += 1
      } else {
        flags[key] = true
      }
    } else {
      positionals.push(arg)
    }
  }
  return { flags, positionals }
}

export function requireEnvToken() {
  if (!TOKEN) {
    console.error('Set COMFLOW_TOKEN to an owner or org-admin cf_ API key.')
    process.exit(1)
  }
}

export function die(message) {
  console.error(message)
  process.exit(1)
}
