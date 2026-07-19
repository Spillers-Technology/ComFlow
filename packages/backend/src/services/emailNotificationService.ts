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

  /** Verification link for a self-registered account. Sent to the new user. */
  async sendEmailVerification(email: string, token: string): Promise<boolean> {
    if (!config.email.notificationsEnabled) return false

    const base = config.email.publicUrl.replace(/\/$/, '')
    const link = `${base}/verify-email?token=${encodeURIComponent(token)}`
    await this.transport.sendMail({
      from: config.email.from,
      to: email,
      subject: '[ComFlow] Verify your email address',
      text: [
        'Welcome to ComFlow.',
        '',
        'Confirm your email address to unlock billing and phone-number',
        'provisioning on your new account:',
        '',
        link,
        '',
        'If you did not create this account, ignore this message.',
      ].join('\n'),
    })
    return true
  }

  async sendPasswordReset(
    email: string,
    token: string,
    ttlHours: number
  ): Promise<boolean> {
    if (!config.email.notificationsEnabled) return false

    const base = config.email.publicUrl.replace(/\/$/, '')
    const link = `${base}/reset-password?token=${encodeURIComponent(token)}`
    await this.transport.sendMail({
      from: config.email.from,
      to: email,
      subject: '[ComFlow] Reset your password',
      text: [
        'Someone asked to reset the ComFlow password for this address.',
        '',
        `Set a new password (link expires in ${ttlHours} hour${
          ttlHours === 1 ? '' : 's'
        }):`,
        '',
        link,
        '',
        'If this was not you, ignore this message — your password is unchanged.',
      ].join('\n'),
    })
    return true
  }

  /** Operator alert: a tenant was automatically frozen (e.g. chargeback). */
  async sendTenantFrozenAlert(input: {
    tenantName: string
    tenantId: string
    reason: string
  }): Promise<boolean> {
    if (!config.email.notificationsEnabled || config.email.to.length === 0) {
      return false
    }

    await this.transport.sendMail({
      from: config.email.from,
      to: config.email.to,
      subject: `[ComFlow] Tenant frozen: ${input.tenantName}`,
      text: [
        `Tenant "${input.tenantName}" (${input.tenantId}) was automatically frozen.`,
        '',
        `Reason: ${input.reason}`,
        '',
        'Provisioning, top-ups, and inbound service are suspended until an',
        'operator reactivates the tenant on the Tenants page.',
      ].join('\n'),
    })
    return true
  }
}
