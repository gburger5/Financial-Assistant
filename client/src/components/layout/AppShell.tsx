import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { useAuth } from '../../hooks/useAuth'
import './AppShell.css'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/budget': 'Budget',
  '/savings': 'Savings',
  '/investments': 'Investments',
  '/debts': 'Debts',
  '/proposals': 'Proposals',
  '/profile': 'Profile',
}

export default function AppShell() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const title = PAGE_TITLES[location.pathname] ?? 'Financial Assistant'
  const userName = user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email : ''

  return (
    <div className="app-shell">
      <Sidebar onLogout={logout} />
      <div className="app-shell__main">
        <TopBar title={title} userName={userName} />
        <main className="app-shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
