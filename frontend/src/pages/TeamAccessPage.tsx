import { useMemo } from 'react'
import { Box, Card, Tab, Tabs } from '@mui/material'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { CrudPage } from './CrudPage'
import { RolesPage } from './RolesPage'
import { PermissionsPage } from './PermissionsPage'

type TeamTab = 'users' | 'departments' | 'roles' | 'permissions'

export function TeamAccessPage() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabs = useMemo(() => [
    ...(can('users') ? [
      { key: 'users' as const, label: 'Users' },
      { key: 'departments' as const, label: 'Departments' },
      { key: 'roles' as const, label: 'Roles' },
    ] : []),
    ...(can('permissions') ? [{ key: 'permissions' as const, label: 'Permissions' }] : []),
  ], [can])
  const requested = searchParams.get('tab') as TeamTab | null
  const active = tabs.some((tab) => tab.key === requested) ? requested as TeamTab : tabs[0].key
  const actionLabel = active === 'users' ? 'New user'
    : active === 'departments' ? 'New department'
      : active === 'roles' ? 'New role' : undefined
  const onAction = () => navigate(active === 'roles' ? '/roles/new' : `/${active}/new`)

  return <>
    <PageHeader title="Team & Access" description="Manage staff, departments, roles, and individual module access in one place." actionLabel={actionLabel} onAction={actionLabel ? onAction : undefined} />
    <Card sx={{ mb: 2 }}>
      <Tabs value={active} onChange={(_, value: TeamTab) => setSearchParams({ tab: value })} variant="scrollable" scrollButtons="auto" aria-label="Team and access sections">
        {tabs.map((tab) => <Tab key={tab.key} value={tab.key} label={tab.label} />)}
      </Tabs>
    </Card>
    <Box>
      {active === 'users' && can('users') && <CrudPage resourceKey="users" embedded />}
      {active === 'departments' && can('users') && <CrudPage resourceKey="departments" embedded />}
      {active === 'roles' && can('users') && <RolesPage embedded />}
      {active === 'permissions' && can('permissions') && <PermissionsPage embedded />}
    </Box>
  </>
}
