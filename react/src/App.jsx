import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/auth/LoginPage'
import OnboardingPage from './pages/auth/OnboardingPage'
import LandingPage from './pages/landing/LandingPage'
import ResetPasswordPage from './pages/auth/ResetPasswordPage'
import SetPasswordPage from './pages/auth/SetPasswordPage'
import ClientDashboardPage from './pages/client/ClientDashboardPage'

// Admin Layout + páginas
import AdminLayout from './layouts/AdminLayout'
import AdminDashboardPage from './pages/admin/AdminDashboardPage'
import AdminTasksPage from './pages/admin/AdminTasksPage'
import AdminTaskTemplatesPage from './pages/admin/AdminTaskTemplatesPage'
import AdminRequestsPage from './pages/admin/AdminRequestsPage'
import AdminDocumentsPage from './pages/admin/AdminDocumentsPage'
import AdminCompaniesPage from './pages/admin/AdminCompaniesPage'
import AdminCollectionsPage from './pages/admin/AdminCollectionsPage'
import AdminCollectionsImportPage from './pages/admin/AdminCollectionsImportPage'
import AdminCollectionsDetailPage from './pages/admin/AdminCollectionsDetailPage'
import AdminOnboardingPage from './pages/admin/AdminOnboardingPage'

import './App.css'

function App() {
  return (
    <Routes>
      {/* ── Rutas Públicas / Auth ── */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/set-password" element={<SetPasswordPage />} />

      {/* ── Portal Cliente ── */}
      <Route path="/dashboard" element={<ClientDashboardPage />} />

      {/* ── Admin: Layout compartido con sidebar ── */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard"               element={<AdminDashboardPage />} />
        <Route path="companies"               element={<AdminCompaniesPage />} />
        <Route path="tasks"                   element={<AdminTasksPage />} />
        <Route path="task-templates"          element={<AdminTaskTemplatesPage />} />
        <Route path="requests"                element={<AdminRequestsPage />} />
        <Route path="documents"               element={<AdminDocumentsPage />} />
        <Route path="collections"             element={<AdminCollectionsPage />} />
        <Route path="collections/import"      element={<AdminCollectionsImportPage />} />
        <Route path="collections/detail/:id"  element={<AdminCollectionsDetailPage />} />
        <Route path="onboarding"              element={<AdminOnboardingPage />} />
      </Route>
    </Routes>
  )
}

export default App
