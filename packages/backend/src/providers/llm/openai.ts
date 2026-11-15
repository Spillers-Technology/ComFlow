import {
  CallIntentSchema,
  CallUrgencySchema,
  ExtractedCallFields,
  ExtractedCallFieldsSchema,
} from '../../../../shared/src/index.js'
import { LanguageModelProvider } from './types.js'

async function parseJsonResponse(response: Response) {
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI request failed (${response.status}): ${body}`)
  }

  return response.json() as Promise<Record<string, unknown>>
}

function getMessageContent(payload: Record<string, unknown>) {
  const choices = payload.choices
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('OpenAI response did not include any choices.')
  }

  const first = choices[0] as {
    message?: {
      content?: unknown
    }
  }

  if (typeof first.message?.content !== 'string') {
    throw new Error('OpenAI response content was not a string.')
  }

  return first.message.content
}

const INTENTS = CallIntentSchema.options
const URGENCIES = CallUrgencySchema.options

// json_object mode guarantees JSON but not our enums, so the allowed values are
// spelled out in the prompt AND anything off-list is coerced to 'unknown'.
// Previously one invented intent (e.g. "callback_request") failed the whole
// extraction for that voicemail.
export const OPENAI_EXTRACTION_SYSTEM_PROMPT =
  'You extract metadata from a voicemail transcript for an operator. ' +
  'Return only a JSON object with exactly these keys: ' +
  'callerName (string or null), company (string or null), ' +
  'callbackNumber (string or null), ' +
  `intent (one of: ${INTENTS.join(', ')}), ` +
  `urgency (one of: ${URGENCIES.join(', ')}), ` +
  'and summary (a short string). Use null or "unknown" when not stated.'

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

export function normalizeOpenAiExtraction(raw: unknown): ExtractedCallFields {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const intent = (INTENTS as readonly string[]).includes(String(input.intent))
    ? input.intent
    : 'unknown'
  const urgency = (URGENCIES as readonly string[]).includes(String(input.urgency))
    ? input.urgency
    : 'unknown'
  return ExtractedCallFieldsSchema.parse({
    callerName: nullableString(input.callerName),
    company: nullableString(input.company),
    callbackNumber: nullableString(input.callbackNumber),
    intent,
    urgency,
    summary: typeof input.summary === 'string' ? input.summary : '',
  })
}

export class OpenAiLanguageModelProvider implements LanguageModelProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async extractCallMetadata(input: {
    transcript: string
  }): Promise<ExtractedCallFields> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: OPENAI_EXTRACTION_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: input.transcript,
          },
        ],
      }),
    })

    const json = await parseJsonResponse(response)
    return normalizeOpenAiExtraction(
      JSON.parse(getMessageContent(json)) as unknown
    )
  }
}
