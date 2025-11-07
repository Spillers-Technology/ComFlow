import { useState } from 'react'
import {
  Container,
  Button,
  Card,
  CardHeader,
  CardContent,
  Tabs,
  Tab,
  Stack,
  FormControlLabel,
  Switch,
  Typography,
  Divider,
} from '@mui/material'

interface SettingsViewProps {
  onBack: () => void
}

export function SettingsView({ onBack }: SettingsViewProps) {
  const [tab, setTab] = useState(0)
  const [advanced, setAdvanced] = useState(false)

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Button variant="text" onClick={onBack} sx={{ mb: 2 }}>
        ← Back to Dashboard
      </Button>
      <Card>
        <CardHeader
          title="Settings"
          subheader="Only the essentials. Advanced lives behind an intentional switch."
        />
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={3}
            alignItems={{ md: 'center' }}
            mb={2}
          >
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              variant="scrollable"
              scrollButtons="auto"
            >
              <Tab label="Phone System" />
              <Tab label="AI Engine" />
              <Tab label="Storage & Retention" />
              <Tab label="Integrations" disabled={!advanced} />
            </Tabs>
            <FormControlLabel
              control={
                <Switch
                  checked={advanced}
                  onChange={e => setAdvanced(e.target.checked)}
                />
              }
              label="Advanced Mode"
            />
          </Stack>

          <Divider sx={{ mb: 2 }} />

          {tab === 0 && (
            <Typography variant="body2">
              Configure numbers and call behavior in one place. In this demo,
              settings are descriptive only; real SIP + routing wiring slots in
              without changing layout.
            </Typography>
          )}
          {tab === 1 && (
            <Typography variant="body2">
              Choose models, safety levels, and tone. Initial release keeps this
              minimal to avoid decision fatigue.
            </Typography>
          )}
          {tab === 2 && (
            <Typography variant="body2">
              Default: keep transcripts 30 days. Future: per-tenant policies,
              storage backends, and cost safeguards.
            </Typography>
          )}
          {tab === 3 && advanced && (
            <Typography variant="body2">
              Advanced: memory embeddings, flow builders, automations. Hidden for
              normal users; available for power users who know why they’re here.
            </Typography>
          )}
        </CardContent>
      </Card>
    </Container>
  )
}
