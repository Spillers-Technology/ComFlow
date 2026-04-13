import {
  CallbackAttemptStatus,
  InboundTelephonyWebhookInput,
  RecordingCompleteWebhookInput,
} from '../../../../shared/src/index.js'

export interface TelephonyProvider {
  normalizeInbound(payload: unknown): InboundTelephonyWebhookInput
  normalizeRecordingComplete(payload: unknown): RecordingCompleteWebhookInput
  simulateOutboundCallback(input: {
    callbackNumber: string
    script: string
  }): Promise<{
    providerCallId: string
    status: CallbackAttemptStatus
  }>
}
