import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './pages/ProtectedRoute'
import AppShell from './components/layout/AppShell'
import LoginPage from './pages/LoginPage'
import SignUpPage from './pages/SignUpPage'
import CheckEmailPage from './pages/CheckEmailPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import LinkBankPage from './pages/LinkBankPage'
import DashboardPage from './pages/DashboardPage'
import BudgetPage from './pages/BudgetPage'
import SavingsPage from './pages/SavingsPage'
import InvestmentsPage from './pages/InvestmentsPage'
import DebtsPage from './pages/DebtsPage'
import ProposalsPage from './pages/ProposalsPage'
import ProfilePage from './pages/ProfilePage'

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/check-email" element={<CheckEmailPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />

        {/* Post-signup onboarding */}
        <Route
          path="/link-bank"
          element={
            <ProtectedRoute>
              <LinkBankPage />
            </ProtectedRoute>
          }
        />

        {/* Authenticated (inside AppShell) */}
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/budget" element={<BudgetPage />} />
          <Route path="/savings" element={<SavingsPage />} />
          <Route path="/investments" element={<InvestmentsPage />} />
          <Route path="/debts" element={<DebtsPage />} />
          <Route path="/proposals" element={<ProposalsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
