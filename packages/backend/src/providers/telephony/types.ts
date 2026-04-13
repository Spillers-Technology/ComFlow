import {
  InboundTelephonyWebhookInput,
  RecordingCompleteWebhookInput,
} from '../../../../shared/src/index.js'

export interface TelephonyProvider {
  normalizeInbound(payload: unknown): InboundTelephonyWebhookInput
  normalizeRecordingComplete(payload: unknown): RecordingCompleteWebhookInput
}
