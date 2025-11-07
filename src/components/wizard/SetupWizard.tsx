import { useState, useEffect } from 'react'
import {
  Container,
  Stack,
  Box,
  Typography,
  Card,
  CardHeader,
  CardContent,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import SettingsIcon from '@mui/icons-material/Settings'
import { WizardState, WizardStepKey } from '../../types'
import { SipStep } from './steps/SipStep'
import { LlmStep } from './steps/LlmStep'
import { TtsStep } from './steps/TtsStep'
import { CallTestStep } from './steps/CallTestStep'

interface SetupWizardProps {
  wizardState: WizardState
  onWizardStateChange: (next: WizardState) => void
  onComplete: () => void
}

const ORDER: WizardStepKey[] = ['sip', 'llm', 'tts', 'callTest']

export function SetupWizard({
  wizardState,
  onWizardStateChange,
  onComplete,
}: SetupWizardProps) {
  const [activeStep, setActiveStep] = useState<WizardStepKey>('sip')

  const updateStep = (step: WizardStepKey, updates: Partial<typeof wizardState[WizardStepKey]>) => {
    const next: WizardState = {
      ...wizardState,
      [step]: { ...wizardState[step], ...updates },
    }
    onWizardStateChange(next)
  }

  const canAccess = (step: WizardStepKey): boolean => {
    const index = ORDER.indexOf(step)
    if (index <= 0) return true
    const prevKey = ORDER[index - 1]
    return wizardState[prevKey].done
  }

  useEffect(() => {
    const firstIncomplete = ORDER.find(key => !wizardState[key].done)
    if (firstIncomplete && firstIncomplete !== activeStep) {
      setActiveStep(firstIncomplete)
    }
    const allDone = ORDER.every(key => wizardState[key].done)
    if (allDone) onComplete()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardState])

  const renderStep = () => {
    const shared = {
      wizardState,
    }
    switch (activeStep) {
      case 'sip':
        return (
          <SipStep
            {...shared}
            updateStep={updates => updateStep('sip', updates)}
          />
        )
      case 'llm':
        return (
          <LlmStep
            {...shared}
            updateStep={updates => updateStep('llm', updates)}
          />
        )
      case 'tts':
        return (
          <TtsStep
            {...shared}
            updateStep={updates => updateStep('tts', updates)}
          />
        )
      case 'callTest':
        return (
          <CallTestStep
            {...shared}
            updateStep={updates => updateStep('callTest', updates)}
          />
        )
    }
  }

  return (
    <Container maxWidth="lg" sx={{ py: 5 }}>
      <Stack direction="row" spacing={4} alignItems="flex-start">
        {/* Checklist */}
        <Box sx={{ width: 320 }}>
          <Typography variant="h4" gutterBottom>
            Let&apos;s set up your phone system.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Follow the steps in order. We confirm each piece for you.
          </Typography>
          <Card sx={{ mt: 2 }}>
            <CardHeader title="Setup Checklist" />
            <CardContent>
              <List dense>
                {ORDER.map(key => {
                  const step = wizardState[key]
                  const locked = !canAccess(key)
                  const isActive = activeStep === key
                  return (
                    <ListItem
                      key={key}
                      button
                      disabled={locked}
                      onClick={() => !locked && setActiveStep(key)}
                      sx={{
                        mb: 0.5,
                        borderRadius: 2,
                        bgcolor: isActive && !locked
                          ? 'primary.main'
                          : 'transparent',
                      }}
                    >
                      <ListItemIcon>
                        {step.done ? (
                          <CheckCircleIcon color="success" />
                        ) : locked ? (
                          <RadioButtonUncheckedIcon color="disabled" />
                        ) : (
                          <RadioButtonUncheckedIcon color="primary" />
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary={labelForStep(key)}
                        secondary={
                          locked
                            ? 'Complete previous step first.'
                            : step.done
                            ? 'Completed'
                            : 'Required'
                        }
                      />
                    </ListItem>
                  )
                })}
              </List>
            </CardContent>
          </Card>
          <Stack direction="row" spacing={1} mt={2} alignItems="center">
            <SettingsIcon fontSize="small" color="disabled" />
            <Typography variant="caption" color="text.secondary">
              Advanced options unlock after setup. No labyrinth on day one.
            </Typography>
          </Stack>
        </Box>

        {/* Step Panel */}
        <Box sx={{ flex: 1 }}>{renderStep()}</Box>
      </Stack>
    </Container>
  )
}

function labelForStep(step: WizardStepKey): string {
  switch (step) {
    case 'sip':
      return 'Connect SIP Trunk'
    case 'llm':
      return 'Configure AI Brain'
    case 'tts':
      return 'Choose TTS Voice'
    case 'callTest':
      return 'Test Answering Behavior'
  }
}
