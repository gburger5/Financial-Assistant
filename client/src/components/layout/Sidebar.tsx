import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Wallet,
  PiggyBank,
  FileText,
  User,
  LogOut,
} from 'lucide-react'
import './Sidebar.css'

interface NavItem {
  to: string
  icon: React.ReactNode
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
  { to: '/budget', icon: <Wallet size={20} />, label: 'Budget' },
  { to: '/savings', icon: <PiggyBank size={20} />, label: 'Savings' },
  { to: '/proposals', icon: <FileText size={20} />, label: 'Proposals' },
  { to: '/profile', icon: <User size={20} />, label: 'Profile' },
]

interface SidebarProps {
  onLogout: () => void
}

export default function Sidebar({ onLogout }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar__logo">
        <span className="sidebar__logo-text">FinAssist</span>
        <span className="sidebar__logo-dot" aria-hidden="true" />
      </div>

      <nav className="sidebar__nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              ['sidebar__nav-item', isActive ? 'sidebar__nav-item--active' : ''].filter(Boolean).join(' ')
            }
          >
            <span className="sidebar__nav-icon">{item.icon}</span>
            <span className="sidebar__nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <button className="sidebar__logout" onClick={onLogout} aria-label="Log out">
        <LogOut size={20} />
        <span className="sidebar__nav-label">Logout</span>
      </button>
    </aside>
  )
}
