import path from 'node:path'
import {
  EngineSettingsSchema,
  LlmProviderSchema,
  SttProviderSchema,
  TtsProviderSchema,
} from '../../shared/src/index.js'

const packageRoot = process.cwd()
const dataDir = path.join(packageRoot, 'data')

function readEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) {
      return value
    }
  }

  return ''
}

function readOptionalEnv(name: string) {
  const value = process.env[name]?.trim()
  return value ? value : null
}

function readProviderDefault<T extends string>(
  value: string | undefined,
  schema: { safeParse: (input: unknown) => { success: boolean; data?: T } }
) {
  const parsed = schema.safeParse(value?.trim())
  return parsed.success && parsed.data ? parsed.data : 'fake'
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  packageRoot,
  dataDir,
  recordingsDir: path.join(dataDir, 'recordings'),
  callbackAudioDir: path.join(dataDir, 'callbacks'),
  databasePath: path.join(dataDir, 'comflow.db'),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  seedDemo: process.env.COMFLOW_SEED_DEMO !== 'false',
  secrets: {
    openaiApiKey: readEnv('COMFLOW_OPENAI_API_KEY', 'OPENAI_API_KEY'),
    anthropicApiKey: readEnv('COMFLOW_ANTHROPIC_API_KEY', 'ANTHROPIC_API_KEY'),
    elevenLabsApiKey: readEnv(
      'COMFLOW_ELEVENLABS_API_KEY',
      'ELEVENLABS_API_KEY'
    ),
  },
  defaultEngineSettings: EngineSettingsSchema.parse({
    llm: {
      provider: readProviderDefault(
        process.env.COMFLOW_DEFAULT_LLM_PROVIDER,
        LlmProviderSchema
      ),
      model: readOptionalEnv('COMFLOW_DEFAULT_LLM_MODEL'),
    },
    stt: {
      provider: readProviderDefault(
        process.env.COMFLOW_DEFAULT_STT_PROVIDER,
        SttProviderSchema
      ),
      model: readOptionalEnv('COMFLOW_DEFAULT_STT_MODEL'),
    },
    tts: {
      provider: readProviderDefault(
        process.env.COMFLOW_DEFAULT_TTS_PROVIDER,
        TtsProviderSchema
      ),
      model: readOptionalEnv('COMFLOW_DEFAULT_TTS_MODEL'),
      voice: readOptionalEnv('COMFLOW_DEFAULT_TTS_VOICE'),
    },
  }),
}
