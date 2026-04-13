import {
  ExtractedCallFields,
  ExtractedCallFieldsSchema,
} from '../../../../shared/src/index.js'
import { TranscriptExtractionProvider } from './types.js'

function matchIntent(transcript: string): ExtractedCallFields['intent'] {
  const lower = transcript.toLowerCase()
  if (lower.includes('billing') || lower.includes('invoice')) {
    return 'billing_request'
  }
  if (
    lower.includes('sales') ||
    lower.includes('pricing') ||
    lower.includes('quote')
  ) {
    return 'sales_request'
  }
  if (lower.includes('operator') || lower.includes('front desk')) {
    return 'operator_request'
  }
  if (
    lower.includes('support') ||
    lower.includes('help') ||
    lower.includes('issue')
  ) {
    return 'support_request'
  }
  return 'unknown'
}

function matchUrgency(transcript: string): ExtractedCallFields['urgency'] {
  const lower = transcript.toLowerCase()
  if (
    lower.includes('urgent') ||
    lower.includes('asap') ||
    lower.includes('immediately')
  ) {
    return 'high'
  }
  if (lower.includes('when you can') || lower.includes('no rush')) {
    return 'low'
  }
  if (lower.trim().length === 0) {
    return 'unknown'
  }
  return 'normal'
}

function findCallbackNumber(transcript: string): string | null {
  const match = transcript.match(/(\+?\d[\d\s().-]{7,}\d)/)
  return match?.[1] ?? null
}

function findCallerName(transcript: string): string | null {
  const match = transcript.match(
    /(?:this is|i am|i'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
  )
  return match?.[1] ?? null
}

function findCompany(transcript: string): string | null {
  const match = transcript.match(
    /from\s+([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*)*)/i
  )
  return match?.[1] ?? null
}

export class FakeTranscriptExtractionProvider
  implements TranscriptExtractionProvider
{
  async extractCallMetadata(input: {
    transcript: string
  }): Promise<ExtractedCallFields> {
    const transcript = input.transcript.trim()
    return ExtractedCallFieldsSchema.parse({
      callerName: findCallerName(transcript),
      company: findCompany(transcript),
      callbackNumber: findCallbackNumber(transcript),
      intent: matchIntent(transcript),
      urgency: matchUrgency(transcript),
      summary:
        transcript.length > 160
          ? `${transcript.slice(0, 157)}...`
          : transcript || 'No transcript available.',
    })
  }
}
