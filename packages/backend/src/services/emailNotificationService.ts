import path from 'node:path'
import nodemailer from 'nodemailer'
import { CallRecord } from '../../../shared/src/index.js'
import { config } from '../config.js'

function label(value: string | null | undefined, fallback = 'Unknown') {
  return value?.trim() || fallback
}

function formatIntent(value: string) {
  return value.replace(/_/g, ' ')
}

function excerpt(value: string | null, maxLength = 1200) {
  if (!value) return 'No transcript available.'
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function reviewUrl(call: CallRecord) {
  return `${config.email.publicUrl.replace(/\/$/, '')}/calls/${call.id}`
}

function recordingAttachment(call: CallRecord) {
  if (!config.email.attachRecording || !call.recordingPath) return []

  const absolutePath = path.resolve(config.dataDir, call.recordingPath)
  if (!absolutePath.startsWith(config.recordingsDir)) return []

  const extension = path.extname(call.recordingPath) || '.wav'
  return [
    {
      filename: `comflow-voicemail-${call.id}${extension}`,
      path: absolutePath,
      contentType: call.recordingMimeType ?? 'audio/wav',
    },
  ]
}

/**
 * SMTP notifications are optional and Postfix-friendly by default:
 * localhost:25, no auth, no TLS unless configured otherwise.
 */
export class EmailNotificationService {
  private readonly transport = nodemailer.createTransport({
    host: config.email.smtpHost,
    port: config.email.smtpPort,
    secure: config.email.smtpSecure,
    auth:
      config.email.smtpUser && config.email.smtpPassword
        ? {
            user: config.email.smtpUser,
            pass: config.email.smtpPassword,
          }
        : undefined,
  })

  async sendVoicemailProcessed(call: CallRecord): Promise<boolean> {
    if (!config.email.notificationsEnabled || config.email.to.length === 0) {
      return false
    }

    const caller = label(call.callerName ?? call.callbackNumber, 'Unknown caller')
    const subject = `[ComFlow] ${call.urgency.toUpperCase()} voicemail from ${caller}`
    const text = [
      'A voicemail has been processed in ComFlow.',
      '',
      `Review: ${reviewUrl(call)}`,
      '',
      `Caller: ${label(call.callerName)}`,
      `Company: ${label(call.company, 'None')}`,
      `Callback: ${label(call.callbackNumber, 'None')}`,
      `Intent: ${formatIntent(call.intent)}`,
      `Urgency: ${call.urgency}`,
      `Status: ${call.status}`,
      '',
      'Summary:',
      call.summary ?? 'No summary available.',
      '',
      'Transcript:',
      excerpt(call.transcript),
    ].join('\n')

    await this.transport.sendMail({
      from: config.email.from,
      to: config.email.to,
      subject,
      text,
      attachments: recordingAttachment(call),
    })

    return true
  }
}
