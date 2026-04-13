import {
  AppBar,
  Box,
  Button,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material'
import { NavLink } from 'react-router-dom'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar>
          <Typography variant="h6" fontWeight={700} sx={{ letterSpacing: '-0.5px', flexGrow: 1 }}>
            ComFlow
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button color="inherit" component={NavLink} to="/calls">
              Inbox
            </Button>
            <Button color="inherit" component={NavLink} to="/settings">
              Settings
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ flex: 1 }}>
        {children}
      </Box>
    </Box>
  )
}
