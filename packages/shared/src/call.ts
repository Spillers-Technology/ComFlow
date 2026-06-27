import { z } from 'zod'

export const CallIntentSchema = z.enum([
  'support_request',
  'sales_request',
  'operator_request',
  'billing_request',
  'unknown',
])

export const CallUrgencySchema = z.enum(['low', 'normal', 'high', 'unknown'])

export const CallStatusSchema = z.enum([
  'new',
  'reviewed',
  'assigned',
  'resolved',
  'spam',
])

export const RecordingStatusSchema = z.enum(['missing', 'pending', 'ready'])

export const CallSourceSchema = z.enum(['fake', 'telephony'])

export const CallRecordSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  callerName: z.string().nullable(),
  company: z.string().nullable(),
  callbackNumber: z.string().nullable(),
  intent: CallIntentSchema,
  urgency: CallUrgencySchema,
  summary: z.string().nullable(),
  transcript: z.string().nullable(),
  status: CallStatusSchema,
  assignedQueue: z.string().nullable(),
  recordingStatus: RecordingStatusSchema,
  recordingPath: z.string().nullable(),
  recordingMimeType: z.string().nullable(),
  telephonyCallId: z.string().nullable(),
  rawTranscript: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  syncedTicketId: z.string().nullable(),
  syncedTicketProvider: z.string().nullable(),
  syncedAt: z.string().nullable(),
  mailboxId: z.string().nullable(),
  source: CallSourceSchema,
})

export const CallListItemSchema = CallRecordSchema.pick({
  id: true,
  createdAt: true,
  updatedAt: true,
  callerName: true,
  callbackNumber: true,
  intent: true,
  urgency: true,
  summary: true,
  status: true,
  assignedQueue: true,
  recordingStatus: true,
  telephonyCallId: true,
  source: true,
}).extend({
  company: z.string().nullable(),
})

export const ExtractedCallFieldsSchema = z.object({
  callerName: z.string().nullable(),
  company: z.string().nullable(),
  callbackNumber: z.string().nullable(),
  intent: CallIntentSchema,
  urgency: CallUrgencySchema,
  summary: z.string(),
})

export const CallUpdateInputSchema = z
  .object({
    callerName: z.string().min(1).nullable().optional(),
    company: z.string().min(1).nullable().optional(),
    callbackNumber: z.string().min(1).nullable().optional(),
    intent: CallIntentSchema.optional(),
    urgency: CallUrgencySchema.optional(),
    summary: z.string().min(1).nullable().optional(),
    status: CallStatusSchema.optional(),
    assignedQueue: z.string().min(1).nullable().optional(),
  })
  .refine(value => Object.keys(value).length > 0, {
    message: 'At least one editable field is required.',
  })

export type CallIntent = z.infer<typeof CallIntentSchema>
export type CallUrgency = z.infer<typeof CallUrgencySchema>
export type CallStatus = z.infer<typeof CallStatusSchema>
export type RecordingStatus = z.infer<typeof RecordingStatusSchema>
export type CallSource = z.infer<typeof CallSourceSchema>
export type CallRecord = z.infer<typeof CallRecordSchema>
export type CallListItem = z.infer<typeof CallListItemSchema>
export type ExtractedCallFields = z.infer<typeof ExtractedCallFieldsSchema>
export type CallUpdateInput = z.infer<typeof CallUpdateInputSchema>
