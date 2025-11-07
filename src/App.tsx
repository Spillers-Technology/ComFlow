import { useState } from 'react'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { theme } from './theme'
import { View, WizardState, Voicemail } from './types'
import { AuthScreen } from './components/auth/AuthScreen'
import { SetupWizard } from './components/wizard/SetupWizard'
import { Dashboard } from './components/dashboard/Dashboard'
import { VoicemailDetail } from './components/voicemail/VoicemailDetail'
import { SettingsView } from './components/settings/SettingsView'

function App() {
  const [view, setView] = useState<View>('auth')
  const [wizardState, setWizardState] = useState<WizardState>({
    sip: { done: false },
    llm: { done: false },
    tts: { done: false },
    callTest: { done: false },
  })
  const [setupComplete, setSetupComplete] = useState(false)
  const [selectedVoicemail, setSelectedVoicemail] = useState<Voicemail | null>(
    null
  )

  const handleWizardComplete = () => {
    if (!setupComplete) {
      setSetupComplete(true)
      setView('setup-complete')
    }
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      {view === 'auth' && (
        <AuthScreen
          onLogin={() => {
            // For now: if setupComplete, go dashboard; else wizard.
            // setView(setupComplete ? 'dashboard' : 'wizard')
            // NAH: straight to the dashboard:
            setView('dashboard')
          }}
          onCreateAccount={() => {
            // New account always runs onboarding questline.
            setWizardState({
              sip: { done: false },
              llm: { done: false },
              tts: { done: false },
              callTest: { done: false },
            })
            setView('wizard')
          }}
        />
      )}

      {view === 'wizard' && (
        <SetupWizard
          wizardState={wizardState}
          onWizardStateChange={setWizardState}
          onComplete={handleWizardComplete}
        />
      )}

      {view === 'setup-complete' && (
        // Small dedicated "complete" view inline to avoid another file
        <SetupCompleteInline
          onGoDashboard={() => setView('dashboard')}
        />
      )}

      {view === 'dashboard' && !selectedVoicemail && (
        <Dashboard
          onOpenSettings={() => setView('settings')}
          onOpenVoicemail={vm => {
            setSelectedVoicemail(vm)
            setView('voicemail-detail')
          }}
        />
      )}

      {view === 'voicemail-detail' && selectedVoicemail && (
        <VoicemailDetail
          voicemail={selectedVoicemail}
          onBack={() => {
            setSelectedVoicemail(null)
            setView('dashboard')
          }}
        />
      )}

      {view === 'settings' && (
        <SettingsView onBack={() => setView('dashboard')} />
      )}
    </ThemeProvider>
  )
}

function SetupCompleteInline({
  onGoDashboard,
}: {
  onGoDashboard: () => void
}) {
  // Kept lightweight; can be extracted if it grows.
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <div
        style={{
          maxWidth: 800,
          width: '100%',
          background: '#0C1020',
          borderRadius: 16,
          padding: '2rem',
        }}
      >
        <h1 style={{ marginTop: 0 }}>Setup complete 🎉</h1>
        <p style={{ color: '#9ca3af' }}>
          You&apos;ve walked through the essentials. Next you&apos;ll see a calm
          dashboard with voicemails, health, and storage—all ready for real
          wiring later.
        </p>
        <div
          style={{
            display: 'grid',
            gap: '1rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            marginTop: '1.5rem',
          }}
        >
          <div>
            <div>📞 Active Voicemail Line</div>
            <div style={{ fontWeight: 600 }}>Configured (demo)</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              Real DID appears here once SIP is live.
            </div>
          </div>
          <div>
            <div>🗄️ Log Destination</div>
            <div style={{ fontWeight: 600 }}>Local Comflow Storage</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              Later: DB, S3, encrypted disks—you choose.
            </div>
          </div>
          <div>
            <div>🔌 Integrations</div>
            <div style={{ fontWeight: 600 }}>AI & Voice linked (demo)</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              Provider & model details surface cleanly here.
            </div>
          </div>
        </div>
        <button
          onClick={onGoDashboard}
          style={{
            marginTop: '2rem',
            padding: '0.8rem 1.5rem',
            borderRadius: 999,
            border: 'none',
            background: '#4F8BFF',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  )
}

export default App
