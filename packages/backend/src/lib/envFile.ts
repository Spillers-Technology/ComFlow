import fs from 'node:fs'
import path from 'node:path'

function unique(values: string[]) {
  return [...new Set(values)]
}

function envFileCandidates() {
  const explicit = process.env.COMFLOW_ENV_FILE?.trim()
  if (explicit) {
    return [
      path.isAbsolute(explicit) ? explicit : path.resolve(process.cwd(), explicit),
    ]
  }

  return unique(
    [
      process.cwd(),
      process.env.INIT_CWD,
      path.resolve(process.cwd(), '..'),
      path.resolve(process.cwd(), '../..'),
    ]
      .filter((value): value is string => Boolean(value))
      .map(directory => path.join(directory, '.env'))
  )
}

function parseEnvValue(rawValue: string) {
  const value = rawValue.trim()
  const quote = value[0]

  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    const unquoted = value.slice(1, -1)
    return quote === '"'
      ? unquoted
          .replaceAll('\\n', '\n')
          .replaceAll('\\r', '\r')
          .replaceAll('\\t', '\t')
          .replaceAll('\\"', '"')
          .replaceAll('\\\\', '\\')
      : unquoted
  }

  const commentIndex = value.search(/\s#/)
  return (commentIndex >= 0 ? value.slice(0, commentIndex) : value).trim()
}

export function loadEnvFile(filePath?: string): string | null {
  const candidates = filePath
    ? [path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)]
    : envFileCandidates()
  const resolved = candidates.find(candidate => fs.existsSync(candidate))
  if (!resolved) return null

  const lines = fs.readFileSync(resolved, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(
      trimmed
    )
    if (!match) continue

    const [, name, rawValue = ''] = match
    if (!name) continue

    if (process.env[name] === undefined) {
      process.env[name] = parseEnvValue(rawValue)
    }
  }

  return resolved
}
