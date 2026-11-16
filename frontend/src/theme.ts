import { alpha, createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#ef6c3e', dark: '#c44f27', light: '#ff986f' },
    secondary: { main: '#167d89' },
    background: { default: '#f5f3ef', paper: '#ffffff' },
    text: { primary: '#17212b', secondary: '#65717d' },
    divider: '#e8e4dd',
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'Inter, "Segoe UI", sans-serif',
    h1: { fontFamily: '"DM Sans", Inter, sans-serif', fontWeight: 750 },
    h2: { fontFamily: '"DM Sans", Inter, sans-serif', fontWeight: 750 },
    h3: { fontFamily: '"DM Sans", Inter, sans-serif', fontWeight: 700 },
    h4: { fontFamily: '"DM Sans", Inter, sans-serif', fontWeight: 700 },
    h5: { fontFamily: '"DM Sans", Inter, sans-serif', fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 700 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 10, minHeight: 40 } },
    },
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: 'none' } },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid #ebe7e0',
          boxShadow: `0 12px 35px ${alpha('#26313c', 0.055)}`,
        },
      },
    },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiTableCell: {
      styleOverrides: {
        head: { color: '#65717d', fontSize: 12, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase' },
      },
    },
  },
})
