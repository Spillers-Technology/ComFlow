import { Box, CircularProgress, CssBaseline, ThemeProvider } from '@mui/material'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { theme } from './theme'
import { AuthProvider, useAuth } from './AuthContext'
import { AppShell } from '../components/AppShell'
import { CallDetailPage } from '../pages/CallDetailPage'
import { CallInboxPage } from '../pages/CallInboxPage'
import { ConnectionsPage } from '../pages/ConnectionsPage'
import { LoginPage } from '../pages/LoginPage'
import { ScheduledCallsPage } from '../pages/ScheduledCallsPage'
import { SettingsPage } from '../pages/SettingsPage'

function AppGate() {
  const { user, authRequired, loading } = useAuth()

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (authRequired && !user) {
    return <LoginPage />
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/calls" replace />} />
        <Route path="/calls" element={<CallInboxPage />} />
        <Route path="/calls/:id" element={<CallDetailPage />} />
        <Route path="/scheduled-calls" element={<ScheduledCallsPage />} />
        <Route path="/connections" element={<ConnectionsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </AppShell>
  )
}

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <AppGate />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
