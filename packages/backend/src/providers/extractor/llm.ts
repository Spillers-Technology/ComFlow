import Anthropic from '@anthropic-ai/sdk'
import {
  ExtractedCallFields,
  ExtractedCallFieldsSchema,
} from '../../../../shared/src/index.js'
import { TranscriptExtractionProvider } from './types.js'
import { FakeTranscriptExtractionProvider } from './fake.js'

const SYSTEM_PROMPT = `You are a call analyst for a business voicemail inbox. \
Your job is to read voicemail transcripts and extract structured metadata so operators \
can quickly triage and route calls without replaying recordings. \
Always call the extract_call_metadata tool. Be concise and accurate. \
Write the summary as a 2-4 sentence plain-English description — do NOT truncate the transcript.`

const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'extract_call_metadata',
  description: 'Extract structured metadata fields from a voicemail transcript.',
  input_schema: {
    type: 'object' as const,
    properties: {
      callerName: {
        type: ['string', 'null'] as unknown as 'string',
        description: "The caller's full name, or null if not stated.",
      },
      company: {
        type: ['string', 'null'] as unknown as 'string',
        description: "The caller's company or organization, or null if not stated.",
      },
      callbackNumber: {
        type: ['string', 'null'] as unknown as 'string',
        description: 'The phone number the caller wants to be reached at, or null.',
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
        description: 'The primary purpose of the call.',
      },
      urgency: {
        type: 'string' as const,
        enum: ['low', 'normal', 'high', 'unknown'],
        description: 'How urgently the caller needs a response.',
      },
      summary: {
        type: 'string' as const,
        description:
          '2-4 sentence plain-English summary of the call for operators. Do NOT truncate the transcript — write a real summary.',
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

export class LlmTranscriptExtractionProvider
  implements TranscriptExtractionProvider
{
  private readonly client: Anthropic
  private readonly fallback = new FakeTranscriptExtractionProvider()

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  async extractCallMetadata(input: {
    transcript: string
  }): Promise<ExtractedCallFields> {
    try {
      const message = await this.client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        tools: [EXTRACT_TOOL],
        tool_choice: { type: 'any' },
        messages: [
          {
            role: 'user',
            content: `Please extract the call metadata from the following transcript:\n\n${input.transcript}`,
          },
        ],
      })

      for (const block of message.content) {
        if (block.type === 'tool_use' && block.name === 'extract_call_metadata') {
          return ExtractedCallFieldsSchema.parse(block.input)
        }
      }

      console.warn('[LlmExtractor] No tool_use block returned; falling back to fake.')
      return this.fallback.extractCallMetadata(input)
    } catch (error) {
      console.warn(
        '[LlmExtractor] API error, falling back to fake:',
        (error as Error).message
      )
      return this.fallback.extractCallMetadata(input)
    }
  }
}
