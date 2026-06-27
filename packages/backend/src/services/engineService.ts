import {
  EngineKind,
  EngineReadinessMap,
  EngineSecretKey,
  EngineSecretSource,
  EngineSecretStatusMap,
  EngineSettings,
  EngineSettingsSchema,
  EngineTestResult,
  ExtractedCallFieldsSchema,
  GetEngineSettingsResponse,
  UpdateEngineSettingsRequest,
  UpdateEngineSettingsRequestSchema,
} from '../../../shared/src/index.js'
import { config } from '../config.js'
import { HttpError } from '../lib/errors.js'
import { engineSecretRepository } from '../repositories/engineSecretRepository.js'
import { engineSettingsRepository } from '../repositories/engineSettingsRepository.js'
import { AnthropicLanguageModelProvider } from '../providers/llm/anthropic.js'
import { FakeLanguageModelProvider } from '../providers/llm/fake.js'
import { OpenAiLanguageModelProvider } from '../providers/llm/openai.js'
import { LanguageModelProvider } from '../providers/llm/types.js'
import { ElevenLabsSpeechToTextProvider } from '../providers/stt/elevenlabs.js'
import { FakeSpeechToTextProvider } from '../providers/stt/fake.js'
import { OpenAiSpeechToTextProvider } from '../providers/stt/openai.js'
import { SpeechToTextProvider } from '../providers/stt/types.js'
import { ElevenLabsTextToSpeechProvider } from '../providers/tts/elevenlabs.js'
import { FakeTextToSpeechProvider } from '../providers/tts/fake.js'
import { OpenAiTextToSpeechProvider } from '../providers/tts/openai.js'
import { TextToSpeechProvider } from '../providers/tts/types.js'

export class EngineService {
  getCurrentSettings(): EngineSettings {
    return EngineSettingsSchema.parse(
      engineSettingsRepository.get() ?? config.defaultEngineSettings
    )
  }

  getReadiness(settings = this.getCurrentSettings()): EngineReadinessMap {
    const secrets = this.getEffectiveSecrets()

    return {
      llm: {
        provider: settings.llm.provider,
        model: settings.llm.model,
        ready:
          settings.llm.provider === 'fake' ||
          Boolean(
            settings.llm.provider === 'openai'
              ? secrets.openaiApiKey
              : secrets.anthropicApiKey
          ),
        missingSecrets:
          settings.llm.provider === 'fake'
            ? []
            : [
                settings.llm.provider === 'openai'
                  ? 'COMFLOW_OPENAI_API_KEY'
                  : 'COMFLOW_ANTHROPIC_API_KEY',
              ].filter(() =>
                !this.hasSecretForLlm(settings.llm.provider, secrets)
              ),
      },
      stt: {
        provider: settings.stt.provider,
        model: settings.stt.model,
        ready:
          settings.stt.provider === 'fake' ||
          Boolean(
            settings.stt.provider === 'openai'
              ? secrets.openaiApiKey
              : secrets.elevenLabsApiKey
          ),
        missingSecrets:
          settings.stt.provider === 'fake'
            ? []
            : [
                settings.stt.provider === 'openai'
                  ? 'COMFLOW_OPENAI_API_KEY'
                  : 'COMFLOW_ELEVENLABS_API_KEY',
              ].filter(() =>
                !this.hasSecretForStt(settings.stt.provider, secrets)
              ),
      },
      tts: {
        provider: settings.tts.provider,
        model: settings.tts.model,
        voice: settings.tts.voice,
        ready:
          settings.tts.provider === 'fake' ||
          Boolean(
            settings.tts.provider === 'openai'
              ? secrets.openaiApiKey
              : secrets.elevenLabsApiKey
          ),
        missingSecrets:
          settings.tts.provider === 'fake'
            ? []
            : [
                settings.tts.provider === 'openai'
                  ? 'COMFLOW_OPENAI_API_KEY'
                  : 'COMFLOW_ELEVENLABS_API_KEY',
              ].filter(() =>
                !this.hasSecretForTts(settings.tts.provider, secrets)
              ),
      },
    }
  }

  getSettingsResponse(): GetEngineSettingsResponse {
    const settings = this.getCurrentSettings()
    return {
      settings,
      readiness: this.getReadiness(settings),
      secrets: this.getSecretStatuses(),
    }
  }

  updateSettings(input: UpdateEngineSettingsRequest): GetEngineSettingsResponse {
    const { settings, secrets } = UpdateEngineSettingsRequestSchema.parse(input)
    if (secrets) {
      engineSecretRepository.applyPatch(secrets)
    }
    engineSettingsRepository.upsert(settings)
    return this.getSettingsResponse()
  }

  async transcribeRecording(input: { filePath: string; mimeType: string }) {
    return this.createSpeechToTextProvider().transcribeRecording(input)
  }

  async extractFromTranscript(transcript: string) {
    const result = await this.createLanguageModelProvider().extractCallMetadata({
      transcript,
    })
    return ExtractedCallFieldsSchema.parse(result)
  }

  async synthesizeSpeech(input: { text: string }) {
    return this.createTextToSpeechProvider().synthesize({ text: input.text })
  }

  async testEngine(engine: EngineKind): Promise<EngineTestResult> {
    const checkedAt = new Date().toISOString()

    try {
      const readiness = this.getReadiness()
      if (!readiness[engine].ready) {
        return {
          engine,
          checkedAt,
          success: false,
          message: `Missing required secrets: ${readiness[engine].missingSecrets.join(', ')}`,
        }
      }

      if (engine === 'stt') {
        return {
          engine,
          checkedAt,
          success: true,
          message:
            'Configuration looks ready. Live transcription is exercised during recording processing.',
        }
      }

      if (engine === 'llm') {
        const extracted = await this.extractFromTranscript(
          'Hello, this is Morgan from Northfield Labs. Please call me back at 555-0199 about our billing issue.'
        )
        return {
          engine,
          checkedAt,
          success: true,
          message: `LLM test succeeded with intent "${extracted.intent}".`,
        }
      }

      const provider = this.createTextToSpeechProvider()
      const audio = await provider.synthesize({
        text: 'Hello from ComFlow. This is a text to speech engine test.',
      })
      return {
        engine,
        checkedAt,
        success: true,
        message: `TTS test succeeded and generated ${audio.audio.byteLength} bytes of audio.`,
      }
    } catch (error) {
      return {
        engine,
        checkedAt,
        success: false,
        message: (error as Error).message,
      }
    }
  }

  private createLanguageModelProvider(): LanguageModelProvider {
    const settings = this.getCurrentSettings().llm
    const secrets = this.getEffectiveSecrets()

    switch (settings.provider) {
      case 'fake':
        return new FakeLanguageModelProvider()
      case 'openai':
        if (!secrets.openaiApiKey) {
          throw new HttpError(503, 'OpenAI API key is not configured.')
        }
        return new OpenAiLanguageModelProvider(
          secrets.openaiApiKey,
          settings.model!
        )
      case 'anthropic':
        if (!secrets.anthropicApiKey) {
          throw new HttpError(503, 'Anthropic API key is not configured.')
        }
        return new AnthropicLanguageModelProvider(
          secrets.anthropicApiKey,
          settings.model!
        )
    }
  }

  private createSpeechToTextProvider(): SpeechToTextProvider {
    const settings = this.getCurrentSettings().stt
    const secrets = this.getEffectiveSecrets()

    switch (settings.provider) {
      case 'fake':
        return new FakeSpeechToTextProvider()
      case 'openai':
        if (!secrets.openaiApiKey) {
          throw new HttpError(503, 'OpenAI API key is not configured.')
        }
        return new OpenAiSpeechToTextProvider(
          secrets.openaiApiKey,
          settings.model!
        )
      case 'elevenlabs':
        if (!secrets.elevenLabsApiKey) {
          throw new HttpError(503, 'ElevenLabs API key is not configured.')
        }
        return new ElevenLabsSpeechToTextProvider(
          secrets.elevenLabsApiKey,
          settings.model!
        )
    }
  }

  private createTextToSpeechProvider(): TextToSpeechProvider {
    const settings = this.getCurrentSettings().tts
    const secrets = this.getEffectiveSecrets()

    switch (settings.provider) {
      case 'fake':
        return new FakeTextToSpeechProvider()
      case 'openai':
        if (!secrets.openaiApiKey) {
          throw new HttpError(503, 'OpenAI API key is not configured.')
        }
        return new OpenAiTextToSpeechProvider(
          secrets.openaiApiKey,
          settings.model!,
          settings.voice!
        )
      case 'elevenlabs':
        if (!secrets.elevenLabsApiKey) {
          throw new HttpError(503, 'ElevenLabs API key is not configured.')
        }
        return new ElevenLabsTextToSpeechProvider(
          secrets.elevenLabsApiKey,
          settings.model!,
          settings.voice!
        )
    }
  }

  private getEffectiveSecrets(): Record<EngineSecretKey, string> {
    const stored = engineSecretRepository.getAll()
    return {
      openaiApiKey: stored.openaiApiKey ?? config.secrets.openaiApiKey,
      anthropicApiKey:
        stored.anthropicApiKey ?? config.secrets.anthropicApiKey,
      elevenLabsApiKey:
        stored.elevenLabsApiKey ?? config.secrets.elevenLabsApiKey,
    }
  }

  private getSecretStatuses(): EngineSecretStatusMap {
    const stored = engineSecretRepository.getAll()

    return {
      openaiApiKey: this.getSecretStatus(
        'openaiApiKey',
        stored.openaiApiKey
      ),
      anthropicApiKey: this.getSecretStatus(
        'anthropicApiKey',
        stored.anthropicApiKey
      ),
      elevenLabsApiKey: this.getSecretStatus(
        'elevenLabsApiKey',
        stored.elevenLabsApiKey
      ),
    }
  }

  private getSecretStatus(
    key: EngineSecretKey,
    storedValue: string | undefined
  ) {
    const source: EngineSecretSource = storedValue
      ? 'stored'
      : config.secrets[key]
        ? 'env'
        : 'missing'

    return {
      configured: source !== 'missing',
      source,
    }
  }

  private hasSecretForLlm(
    provider: EngineSettings['llm']['provider'],
    secrets: Record<EngineSecretKey, string>
  ) {
    return provider === 'openai'
      ? Boolean(secrets.openaiApiKey)
      : provider === 'anthropic'
        ? Boolean(secrets.anthropicApiKey)
        : true
  }

  private hasSecretForStt(
    provider: EngineSettings['stt']['provider'],
    secrets: Record<EngineSecretKey, string>
  ) {
    return provider === 'openai'
      ? Boolean(secrets.openaiApiKey)
      : provider === 'elevenlabs'
        ? Boolean(secrets.elevenLabsApiKey)
        : true
  }

  private hasSecretForTts(
    provider: EngineSettings['tts']['provider'],
    secrets: Record<EngineSecretKey, string>
  ) {
    return provider === 'openai'
      ? Boolean(secrets.openaiApiKey)
      : provider === 'elevenlabs'
        ? Boolean(secrets.elevenLabsApiKey)
        : true
  }
}
