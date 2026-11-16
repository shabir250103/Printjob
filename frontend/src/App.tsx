import { Navigate, Route, Routes, useLocation } from 'react-router'
import { Box, Button, CircularProgress, Typography } from '@mui/material'
import LockRounded from '@mui/icons-material/LockRounded'
import { useAuth } from './auth/AuthContext'
import { AppShell } from './components/AppShell'
import { DashboardPage } from './pages/DashboardPage'
import { CrudPage } from './pages/CrudPage'
import { ResourceCreatePage } from './pages/ResourceCreatePage'
import { PipelineConversionPage } from './pages/PipelineConversionPage'
import { InJobOptionCreatePage } from './pages/InJobOptionCreatePage'
import { LoginPage } from './pages/LoginPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { ReportsPage } from './pages/ReportsPage'
import { RolesPage } from './pages/RolesPage'
import { RoleCreatePage } from './pages/RoleCreatePage'
import { PermissionsPage } from './pages/PermissionsPage'
import { JobBoardPage } from './pages/JobBoardPage'
import { resources } from './config/resources'
import { QuotationPage } from './pages/QuotationPage'
import { TeamAccessPage } from './pages/TeamAccessPage'
import { FinancePage } from './pages/FinancePage'
import { CompanySettingsPage } from './pages/CompanySettingsPage'
import { InvoiceManagementPage } from './pages/InvoiceManagementPage'

function Protected({ children }: { children: React.ReactNode }) {
  const { auth, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>
  return auth ? children : <Navigate to="/login" state={{ from: location.pathname }} replace />
}

function ModuleRoute({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { can } = useAuth()
  return can(permission) ? children : <Navigate to="/forbidden" replace />
}

function JobBoardRoute() {
  const { can } = useAuth()
  return can('jobboard') && (can('injobs') || can('outjobs')) ? <JobBoardPage /> : <Navigate to="/forbidden" replace />
}

function TeamAccessRoute() {
  const { can } = useAuth()
  return can('users') || can('permissions') ? <TeamAccessPage /> : <Navigate to="/forbidden" replace />
}

function Forbidden() {
  const { auth, logout } = useAuth()
  const hasAvailableScreen = Boolean(auth?.user.is_superuser || Object.values(auth?.permissions || {}).some(Boolean))
  return <Box sx={{ minHeight: '65vh', display: 'grid', placeItems: 'center', textAlign: 'center' }}><Box><LockRounded sx={{ fontSize: 56, color: 'text.disabled' }} /><Typography variant="h4" sx={{ mt: 1 }}>Access restricted</Typography><Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>Your current role does not have permission to open this module.</Typography>{hasAvailableScreen && <Button href="/" variant="contained" sx={{ mr: 1 }}>Open available screen</Button>}<Button onClick={logout}>Sign out</Button></Box></Box>
}

function DefaultLanding() {
  const { can } = useAuth()
  if (can('dashboard')) return <DashboardPage />
  const accessible = [
    ['followups', '/enquiries'], ['quotations', '/quotations'], ['pipeline', '/pipeline'], ['injobs', '/in-jobs'],
    ['outjobs', '/out-jobs'], ['delivery', '/deliveries'], ['accounts', '/invoices'],
    ['finance', '/finance'], ['cash', '/finance'], ['customers', '/customers'], ['suppliers', '/suppliers'],
    ['stock', '/stock'], ['machine', '/machines'], ['wastage', '/wastage'],
    ['reports', '/reports'], ['company_settings', '/company-settings'], ['users', '/team-access'], ['permissions', '/team-access'],
    ['notifications', '/notifications'],
  ].find(([permission]) => can(permission))
  return accessible ? <Navigate to={accessible[1]} replace /> : <Forbidden />
}

function NotFound() {
  return <Box sx={{ minHeight: '65vh', display: 'grid', placeItems: 'center', textAlign: 'center' }}><Box><Typography variant="h1" color="primary">404</Typography><Typography variant="h5">Page not found</Typography><Button href="/" sx={{ mt: 2 }}>Return home</Button></Box></Box>
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected><AppShell /></Protected>}>
        <Route index element={<DefaultLanding />} />
        <Route path="job-board" element={<JobBoardRoute />} />
        <Route path="team-access" element={<TeamAccessRoute />} />
        <Route path="follow-ups" element={<Navigate to="/enquiries" replace />} />
        <Route path="finance" element={<ModuleRoute permission="finance"><FinancePage /></ModuleRoute>} />
        <Route path="customer-payments/*" element={<Navigate to="/finance" replace />} />
        <Route path="vendor-payments/*" element={<Navigate to="/finance" replace />} />
        <Route path="cash-transfers/*" element={<Navigate to="/finance" replace />} />
        <Route path="cash-transactions/*" element={<Navigate to="/finance" replace />} />
        <Route path="invoices" element={<ModuleRoute permission="accounts"><InvoiceManagementPage /></ModuleRoute>} />
        <Route path="company-settings" element={<ModuleRoute permission="company_settings"><CompanySettingsPage /></ModuleRoute>} />
        {Object.entries(resources).filter(([key]) => key !== 'invoices').map(([key, config]) => (
          <Route key={key}>
            <Route path={key} element={<ModuleRoute permission={config.permission}><CrudPage resourceKey={key} /></ModuleRoute>} />
            <Route path={`${key}/new`} element={<ModuleRoute permission={config.permission}>{key === 'quotations' ? <QuotationPage /> : <ResourceCreatePage resourceKey={key} />}</ModuleRoute>} />
          </Route>
        ))}
        <Route path="pipeline/:id/convert-to-in-job" element={<ModuleRoute permission="pipeline"><PipelineConversionPage kind="in" /></ModuleRoute>} />
        <Route path="quotations/:id/edit" element={<ModuleRoute permission="quotations"><QuotationPage /></ModuleRoute>} />
        <Route path="pipeline/:id/convert-to-out-job" element={<ModuleRoute permission="pipeline"><PipelineConversionPage kind="out" /></ModuleRoute>} />
        <Route path="in-jobs/options/new" element={<ModuleRoute permission="injobs"><InJobOptionCreatePage /></ModuleRoute>} />
        <Route path="reports" element={<ModuleRoute permission="reports"><ReportsPage /></ModuleRoute>} />
        <Route path="notifications" element={<ModuleRoute permission="notifications"><NotificationsPage /></ModuleRoute>} />
        <Route path="roles" element={<ModuleRoute permission="users"><RolesPage /></ModuleRoute>} />
        <Route path="roles/new" element={<ModuleRoute permission="users"><RoleCreatePage /></ModuleRoute>} />
        <Route path="permissions" element={<ModuleRoute permission="permissions"><PermissionsPage /></ModuleRoute>} />
        <Route path="forbidden" element={<Forbidden />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
