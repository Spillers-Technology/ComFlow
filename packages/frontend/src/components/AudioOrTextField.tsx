import { useRef, useState } from 'react'
import {
  Button,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material'
import { AudioPrompt } from '../../../shared/src/index.js'
import { createPrompt, fileToBase64 } from '../lib/api'

export type AudioOrTextValue =
  | { mode: 'text'; text: string }
  | { mode: 'upload'; promptId: string }

interface AudioOrTextFieldProps {
  label: string
  value: AudioOrTextValue
  prompts: AudioPrompt[]
  onChange: (value: AudioOrTextValue) => void
  /** Called after a new prompt is uploaded so the parent can refresh its list. */
  onPromptUploaded: () => Promise<void> | void
  minRows?: number
}

export function AudioOrTextField({
  label,
  value,
  prompts,
  onChange,
  onPromptUploaded,
  minRows = 2,
}: AudioOrTextFieldProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const audioBase64 = await fileToBase64(file)
      const { prompt } = await createPrompt({
        name: file.name,
        kind: 'outbound',
        audioBase64,
        mimeType: file.type || 'audio/wav',
      })
      await onPromptUploaded()
      onChange({ mode: 'upload', promptId: prompt.id })
    } finally {
      setUploading(false)
    }
  }

  return (
    <Stack spacing={1}>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={value.mode}
        onChange={(_event, mode) => {
          if (!mode) return
          onChange(
            mode === 'text'
              ? { mode: 'text', text: '' }
              : { mode: 'upload', promptId: prompts[0]?.id ?? '' }
          )
        }}
      >
        <ToggleButton value="text">{label}: text</ToggleButton>
        <ToggleButton value="upload">{label}: upload</ToggleButton>
      </ToggleButtonGroup>

      {value.mode === 'text' ? (
        <TextField
          label={label}
          value={value.text}
          onChange={event => onChange({ mode: 'text', text: event.target.value })}
          multiline
          minRows={minRows}
          fullWidth
        />
      ) : (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField
            select
            label={`${label} prompt`}
            value={value.promptId}
            onChange={event =>
              onChange({ mode: 'upload', promptId: event.target.value })
            }
            fullWidth
          >
            {prompts.length === 0 ? (
              <MenuItem value="" disabled>
                No uploaded prompts yet
              </MenuItem>
            ) : (
              prompts.map(prompt => (
                <MenuItem key={prompt.id} value={prompt.id}>
                  {prompt.name}
                </MenuItem>
              ))
            )}
          </TextField>
          <Button
            variant="outlined"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="audio/*"
            hidden
            onChange={event => {
              const file = event.target.files?.[0]
              if (file) void handleFile(file)
              event.target.value = ''
            }}
          />
        </Stack>
      )}
    </Stack>
  )
}
