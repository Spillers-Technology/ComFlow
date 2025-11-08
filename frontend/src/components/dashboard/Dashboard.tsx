import {
  Container,
  Stack,
  Box,
  Typography,
  Card,
  CardHeader,
  CardContent,
  Chip,
  LinearProgress,
  IconButton,
} from '@mui/material'
import SettingsIcon from '@mui/icons-material/Settings'
import VoicemailIcon from '@mui/icons-material/Voicemail'
import DashboardIcon from '@mui/icons-material/Dashboard'
import { Voicemail } from '../../types'
import { mockVoicemails, confidenceColor } from '../../mockData'
import { HealthRow } from './HealthRow'

interface DashboardProps {
  onOpenSettings: () => void
  onOpenVoicemail: (vm: Voicemail) => void
}

export function Dashboard({
  onOpenSettings,
  onOpenVoicemail,
}: DashboardProps) {
  const vms = mockVoicemails.slice(0, 5)

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
      >
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <DashboardIcon fontSize="small" />
            <Typography variant="h4">Comflow</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Calm overview. Calls, AI, and storage at a glance.
          </Typography>
        </Box>
        <IconButton onClick={onOpenSettings}>
          <SettingsIcon />
        </IconButton>
      </Stack>

      <Stack spacing={3}>
        <Card>
          <CardHeader
            avatar={<VoicemailIcon />}
            title="Recent voicemails"
            subheader="Latest 5 messages."
          />
          <CardContent>
            {vms.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No voicemails yet. Once calls flow, they show here.
              </Typography>
            )}
            {vms.map(vm => (
              <Box
                key={vm.id}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  py: 1,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' },
                }}
                onClick={() => onOpenVoicemail(vm)}
              >
                <Box>
                  <Typography variant="subtitle2">
                    {vm.from}{' '}
                    <Typography component="span" variant="caption">
                      ({vm.number})
                    </Typography>
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {vm.summary.length > 40
                      ? vm.summary.slice(0, 40) + '…'
                      : vm.summary}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Chip
                    size="small"
                    label={
                      vm.confidence === 'high'
                        ? 'High confidence'
                        : vm.confidence === 'med'
                        ? 'Medium'
                        : 'Low'
                    }
                    color={confidenceColor(vm.confidence)}
                    variant="outlined"
                  />
                  <Typography variant="caption" color="text.secondary">
                    {vm.time}
                  </Typography>
                </Stack>
              </Box>
            ))}
          </CardContent>
        </Card>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
          <Card sx={{ flex: 1 }}>
            <CardHeader title="System health" />
            <CardContent>
              <Stack spacing={1.5}>
                <HealthRow
                  label="SIP Registration"
                  status="green"
                  note="Configured in demo."
                />
                <HealthRow
                  label="AI Brain"
                  status="green"
                  note="Responding (simulated)."
                />
                <HealthRow
                  label="Voice Engine"
                  status="green"
                  note="Sample playback available."
                />
              </Stack>
            </CardContent>
          </Card>

          <Card sx={{ flex: 1 }}>
            <CardHeader title="Storage capacity" />
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                Using 100 MB of 5 GB demo quota.
              </Typography>
              <LinearProgress
                variant="determinate"
                value={(100 / 5000) * 100}
                sx={{ mt: 1.5 }}
              />
              <Typography variant="caption" color="text.secondary">
                Real app: configurable limits & retention policies.
              </Typography>
            </CardContent>
          </Card>
        </Stack>
      </Stack>
    </Container>
  )
}
