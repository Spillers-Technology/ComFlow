import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#5ea0ff',
    },
    background: {
      default: '#08111f',
      paper: '#0f1a2d',
    },
  },
  shape: {
    borderRadius: 14,
  },
  typography: {
    fontFamily: '"Inter", system-ui, sans-serif',
  },
})
