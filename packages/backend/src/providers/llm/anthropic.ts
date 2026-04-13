import Anthropic from '@anthropic-ai/sdk'
import {
  CallRecord,
  ExtractedCallFields,
  ExtractedCallFieldsSchema,
} from '../../../../shared/src/index.js'
import { LanguageModelProvider } from './types.js'

const EXTRACTION_SYSTEM_PROMPT = `You analyze voicemail transcripts and return structured metadata.
Always call the extract_call_metadata tool.
Be concise, accurate, and write a 2-4 sentence summary for an operator.`

const CALLBACK_SYSTEM_PROMPT = `You write short callback scripts for a support voicemail workflow.
Return JSON only with a single "script" field.
The script should sound human, concise, and appropriate for a returned call.`

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: 'extract_call_metadata',
  description: 'Extract structured metadata fields from a voicemail transcript.',
  input_schema: {
    type: 'object' as const,
    properties: {
      callerName: {
        type: ['string', 'null'] as unknown as 'string',
      },
      company: {
        type: ['string', 'null'] as unknown as 'string',
      },
      callbackNumber: {
        type: ['string', 'null'] as unknown as 'string',
      },
      intent: {
        type: 'string' as const,
        enum: [
          'support_request',
          'sales_request',
          'operator_request',
          'billing_request',
          'unknown',
        ],
      },
      urgency: {
        type: 'string' as const,
        enum: ['low', 'normal', 'high', 'unknown'],
      },
      summary: {
        type: 'string' as const,
      },
    },
    required: [
      'callerName',
      'company',
      'callbackNumber',
      'intent',
      'urgency',
      'summary',
    ],
  },
}

export class AnthropicLanguageModelProvider implements LanguageModelProvider {
  private readonly client: Anthropic

  constructor(
    apiKey: string,
    private readonly model: string
  ) {
    this.client = new Anthropic({ apiKey })
  }

  async extractCallMetadata(input: {
    transcript: string
  }): Promise<ExtractedCallFields> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      system: EXTRACTION_SYSTEM_PROMPT,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: 'any' },
      messages: [
        {
          role: 'user',
          content: `Please extract metadata from this transcript:\n\n${input.transcript}`,
        },
      ],
    })

    for (const block of message.content) {
      if (block.type === 'tool_use' && block.name === 'extract_call_metadata') {
        return ExtractedCallFieldsSchema.parse(block.input)
      }
    }

    throw new Error('Anthropic did not return structured extraction output.')
  }

  async generateCallbackScript(input: {
    call: CallRecord
    notes: string | null
  }): Promise<{ script: string }> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 300,
      system: CALLBACK_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            call: {
              callerName: input.call.callerName,
              company: input.call.company,
              callbackNumber: input.call.callbackNumber,
              summary: input.call.summary,
              intent: input.call.intent,
              urgency: input.call.urgency,
              transcript: input.call.transcript,
            },
            notes: input.notes,
          }),
        },
      ],
    })

    const text = message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')

    const parsed = JSON.parse(text) as { script?: unknown }
    if (typeof parsed.script !== 'string' || parsed.script.trim().length === 0) {
      throw new Error('Anthropic did not return a callback script.')
    }

    return { script: parsed.script.trim() }
  }
}
