import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/auth/LoginPage'
import OnboardingPage from './pages/auth/OnboardingPage'
import LandingPage from './pages/landing/LandingPage'
import AdminTasksPage from './pages/admin/AdminTasksPage'
import AdminTaskTemplatesPage from './pages/admin/AdminTaskTemplatesPage'
import AdminRequestsPage from './pages/admin/AdminRequestsPage'
import AdminDocumentsPage from './pages/admin/AdminDocumentsPage'
import AdminDashboardPage from './pages/admin/AdminDashboardPage'
import AdminCompaniesPage from './pages/admin/AdminCompaniesPage'
import AdminCollectionsPage from './pages/admin/AdminCollectionsPage'
import AdminCollectionsImportPage from './pages/admin/AdminCollectionsImportPage'
import AdminCollectionsDetailPage from './pages/admin/AdminCollectionsDetailPage'
import AdminOnboardingPage from './pages/admin/AdminOnboardingPage'
import ClientDashboardPage from './pages/client/ClientDashboardPage'
import ResetPasswordPage from './pages/auth/ResetPasswordPage'
import SetPasswordPage from './pages/auth/SetPasswordPage'
import './App.css'

function App() {
  return (
    <Routes>
      {/* Rutas Públicas / Auth */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/set-password" element={<SetPasswordPage />} />

      {/* Rutas de Cliente */}
      <Route path="/dashboard" element={<ClientDashboardPage />} />
      <Route path="/admin" element={<AdminDashboardPage />} />
      <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
      <Route path="/admin/companies" element={<AdminCompaniesPage />} />
      <Route path="/admin/collections" element={<AdminCollectionsPage />} />
      <Route path="/admin/collections/import" element={<AdminCollectionsImportPage />} />
      <Route path="/admin/collections/detail/:id" element={<AdminCollectionsDetailPage />} />
      <Route path="/admin/tasks" element={<AdminTasksPage />} />
      <Route path="/admin/task-templates" element={<AdminTaskTemplatesPage />} />
      <Route path="/admin/requests" element={<AdminRequestsPage />} />
      <Route path="/admin/documents" element={<AdminDocumentsPage />} />
      <Route path="/admin/onboarding" element={<AdminOnboardingPage />} />
    </Routes>
  )
}

export default App
