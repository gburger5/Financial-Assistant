import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getToken, clearToken } from '../utils/auth'
import './Dashboard.css'

// Types & Data
import type { PageId, Notification } from './types/dashboard'
import { MOCK_NOTIFICATIONS, PAGE_TITLES } from './data/Mockdata'

// Layout Components
import Sidebar from './components/Sidebar'
import NotificationsDropdown from './components/NotificationDropdown'

// Pages
import OverviewPage      from './pages/OverviewPage'
import TransactionsPage  from './pages/TransactionsPage'
import BudgetPage        from './pages/BudgetPage'
import InvestmentsPage   from './pages/InvestmentsPage'
import GoalsPage         from './pages/GoalsPage'
import DebtsPage         from './pages/DebtsPage'
import NotificationsPage from './pages/NotificationsPage'
import ProfilePage       from './pages/ProfilePage'
import SettingsPage      from './pages/SettingsPage'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function Dashboard() {
  const navigate = useNavigate()
  const [activePage,    setActivePage]    = useState<PageId>('overview')
  const [collapsed,     setCollapsed]     = useState(false)
  const [notifOpen,     setNotifOpen]     = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS)

  const unreadCount = notifications.filter(n => n.unread).length

  useEffect(() => {
    const verifyAuth = async () => {
      const token = getToken()
      if (!token) { navigate('/login'); return }
      try {
        const res = await fetch(`${API_BASE}/verify`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) { clearToken(); navigate('/login') }
      } catch {
        navigate('/login')
      }
    }
    verifyAuth()
  }, [navigate])

  const handleLogout = () => { clearToken(); navigate('/login') }
  const markAll  = () => setNotifications(n => n.map(x => ({ ...x, unread: false })))
  const markOne  = (id: number) => setNotifications(n => n.map(x => x.id === id ? { ...x, unread: false } : x))

  const goTo = (page: PageId) => {
    setActivePage(page)
    setNotifOpen(false)
  }

  const { title, subtitle } = PAGE_TITLES[activePage]

  const renderPage = () => {
    switch (activePage) {
      case 'overview':      return <OverviewPage goTo={goTo} />
      case 'transactions':  return <TransactionsPage />
      case 'budget':        return <BudgetPage />
      case 'investments':   return <InvestmentsPage />
      case 'goals':         return <GoalsPage />
      case 'debts':         return <DebtsPage />
      case 'notifications': return <NotificationsPage notifications={notifications} markAll={markAll} markOne={markOne} />
      case 'profile':       return <ProfilePage />
      case 'settings':      return <SettingsPage />
    }
  }

  return (
    <div className="dashboard-root">
      <Sidebar
        activePage={activePage}
        setActivePage={goTo}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        onLogout={handleLogout}
        unreadCount={unreadCount}
      />

      <div className={`dashboard-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Sticky Header */}
        <div className="dashboard-header">
          <div>
            <div className="dashboard-header-title">{title}</div>
            <div className="dashboard-header-subtitle">{subtitle}</div>
          </div>

          <div className="header-actions">
            <div className="notif-wrapper">
              <button
                className={`header-icon-btn ${notifOpen ? 'active' : ''}`}
                onClick={() => setNotifOpen(o => !o)}
                title="Notifications"
              >
                🔔
                {unreadCount > 0 && <div className="notif-badge" />}
              </button>
              {notifOpen && (
                <NotificationsDropdown
                  notifications={notifications}
                  onMarkAll={markAll}
                  onMarkOne={markOne}
                  onViewAll={() => goTo('notifications')}
                  onClose={() => setNotifOpen(false)}
                />
              )}
            </div>

            <button className="header-icon-btn" onClick={() => goTo('settings')} title="Settings">⚙️</button>
            <div className="header-avatar" onClick={() => goTo('profile')} title="Profile">AJ</div>
          </div>
        </div>

        {/* Page Content */}
        <div className="dashboard-page">
          {renderPage()}
        </div>
      </div>
    </div>
  )
}

export default Dashboard