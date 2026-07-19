import { Box, CircularProgress, CssBaseline, ThemeProvider } from '@mui/material'
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { theme } from './theme'
import { AuthProvider } from './AuthContext'
import { useAuth } from './useAuth'
import { AppShell } from '../components/AppShell'
import { AccessPage } from '../pages/AccessPage'
import { BillingUsagePage } from '../pages/BillingUsagePage'
import { CallDetailPage } from '../pages/CallDetailPage'
import { CallInboxPage } from '../pages/CallInboxPage'
import { LoginPage } from '../pages/LoginPage'
import { OnboardingPage } from '../pages/OnboardingPage'
import { ProfilePage } from '../pages/ProfilePage'
import { RegisterPage } from '../pages/RegisterPage'
import { ScheduledCallsPage } from '../pages/ScheduledCallsPage'
import { SettingsPage } from '../pages/SettingsPage'
import { TenantsPage } from '../pages/TenantsPage'
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage'
import { ResetPasswordPage } from '../pages/ResetPasswordPage'
import { VerifyEmailPage } from '../pages/VerifyEmailPage'

function ProtectedShell() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

function AppGate() {
  const {
    user,
    authRequired,
    loading,
    selfRegistrationEnabled,
  } = useAuth()
  const location = useLocation()
  // Open mode (auth not enforced) grants the synthetic admin full access, so
  // the admin UI should show there too — matching the backend's behavior.
  const isAdmin =
    !authRequired || user?.role === 'admin' || user?.role === 'owner'
  const isOwner = !authRequired || user?.role === 'owner'

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (authRequired && !user) {
    const returnTo = `${location.pathname}${location.search}`
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/register"
          element={
            selfRegistrationEnabled ? (
              <RegisterPage />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="*"
          element={
            <Navigate
              to="/login"
              replace
              state={{ from: returnTo }}
            />
          }
        />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/calls" replace />} />
      <Route path="/register" element={<Navigate to="/onboarding" replace />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      {/* Still reachable while signed in: a reset link mailed to someone who
          already has a session should work, not bounce them to the inbox. */}
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        path="/forgot-password"
        element={<Navigate to="/profile" replace />}
      />
      <Route element={<ProtectedShell />}>
        <Route path="/" element={<Navigate to="/calls" replace />} />
        <Route path="/calls" element={<CallInboxPage />} />
        <Route path="/calls/:id" element={<CallDetailPage />} />
        <Route
          path="/onboarding"
          element={
            isAdmin ? <OnboardingPage /> : <Navigate to="/calls" replace />
          }
        />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/billing" element={<BillingUsagePage />} />
        <Route path="/scheduled-calls" element={<ScheduledCallsPage />} />
        <Route
          path="/tenants"
          element={isOwner ? <TenantsPage /> : <Navigate to="/calls" replace />}
        />
        {/* Connections was folded into the Settings → Mailboxes tab. */}
        <Route path="/connections" element={<Navigate to="/settings" replace />} />
        <Route
          path="/settings"
          element={
            isAdmin ? <SettingsPage /> : <Navigate to="/calls" replace />
          }
        />
        <Route
          path="/access"
          element={
            isAdmin ? <AccessPage /> : <Navigate to="/calls" replace />
          }
        />
        <Route path="*" element={<Navigate to="/calls" replace />} />
      </Route>
    </Routes>
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
