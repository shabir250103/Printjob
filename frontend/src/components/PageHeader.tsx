import { Box, Button, Typography } from '@mui/material'
import AddRounded from '@mui/icons-material/AddRounded'

interface Props {
  eyebrow?: string
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  actions?: React.ReactNode
}

export function PageHeader({ eyebrow, title, description, actionLabel, onAction, actions }: Props) {
  return (
    <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 2, mb: 3, flexWrap: 'wrap' }}>
      <Box>
        {eyebrow && <Typography variant="overline" color="primary" fontWeight={800}>{eyebrow}</Typography>}
        <Typography variant="h4" sx={{ fontSize: { xs: 28, md: 34 }, letterSpacing: '-.035em' }}>{title}</Typography>
        {description && <Typography color="text.secondary" sx={{ mt: .7, maxWidth: 680 }}>{description}</Typography>}
      </Box>
      {actions ? (
        <Box sx={{ flexShrink: 0 }}>{actions}</Box>
      ) : actionLabel && onAction ? (
        <Button variant="contained" startIcon={<AddRounded />} onClick={onAction} sx={{ flexShrink: 0 }}>
          {actionLabel}
        </Button>
      ) : null}
    </Box>
  )
}
