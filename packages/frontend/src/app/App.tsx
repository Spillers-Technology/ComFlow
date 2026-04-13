import { CssBaseline, ThemeProvider } from '@mui/material'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { theme } from './theme'
import { AppShell } from '../components/AppShell'
import { CallDetailPage } from '../pages/CallDetailPage'
import { CallInboxPage } from '../pages/CallInboxPage'

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<Navigate to="/calls" replace />} />
            <Route path="/calls" element={<CallInboxPage />} />
            <Route path="/calls/:id" element={<CallDetailPage />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </ThemeProvider>
  )
}
