import {
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
}
