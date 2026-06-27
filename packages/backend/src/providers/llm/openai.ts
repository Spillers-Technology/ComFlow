import {
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
            content:
              'Return JSON with callerName, company, callbackNumber, intent, urgency, and summary for an operator reviewing a voicemail transcript.',
          },
          {
            role: 'user',
            content: input.transcript,
          },
        ],
      }),
    })

    const json = await parseJsonResponse(response)
    return ExtractedCallFieldsSchema.parse(
      JSON.parse(getMessageContent(json)) as unknown
    )
  }
}
