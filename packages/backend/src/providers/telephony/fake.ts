import {
  CallbackAttemptStatus,
  InboundTelephonyWebhookInput,
  InboundTelephonyWebhookSchema,
  RecordingCompleteWebhookInput,
  RecordingCompleteWebhookSchema,
} from '../../../../shared/src/index.js'
import { TelephonyProvider } from './types.js'

export class FakeTelephonyProvider implements TelephonyProvider {
  normalizeInbound(payload: unknown): InboundTelephonyWebhookInput {
    return InboundTelephonyWebhookSchema.parse(payload)
  }

  normalizeRecordingComplete(payload: unknown): RecordingCompleteWebhookInput {
    return RecordingCompleteWebhookSchema.parse(payload)
  }

  async simulateOutboundCallback(): Promise<{
    providerCallId: string
    status: CallbackAttemptStatus
  }> {
    return {
      providerCallId: `fake-callback-${Date.now()}`,
      status: 'simulated_completed',
    }
  }
}
