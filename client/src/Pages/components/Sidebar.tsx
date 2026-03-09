import type { PageId } from '../types/dashboard'
import { NAV_ITEMS } from '../data/Mockdata'

interface SidebarProps {
  activePage: PageId
  setActivePage: (p: PageId) => void
  collapsed: boolean
  setCollapsed: (c: boolean) => void
  onLogout: () => void
  unreadCount: number
}

const Sidebar = ({ activePage, setActivePage, collapsed, setCollapsed, onLogout, unreadCount }: SidebarProps) => (
  <div className={`dashboard-sidebar ${collapsed ? 'collapsed' : ''}`}>
    <div className="sidebar-logo">
      {!collapsed && <span className="sidebar-logo-text">FinanceAI</span>}
      <button
        className="sidebar-collapse-btn"
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        style={{ zIndex: 10, flexShrink: 0, marginLeft: collapsed ? 0 : 'auto' }}
      >
        {collapsed ? '›' : '‹'}
      </button>
    </div>

    <div className="sidebar-nav">
      {!collapsed && <div className="sidebar-section-label">Main</div>}
      {NAV_ITEMS.map(item => (
        <div
          key={item.id}
          className={`sidebar-nav-item ${activePage === item.id ? 'active' : ''}`}
          onClick={() => setActivePage(item.id)}
          title={collapsed ? item.label : undefined}
        >
          <span className="sidebar-nav-icon" style={{ position: 'relative' }}>
            {item.icon}
            {item.id === 'notifications' && unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -6,
                background: '#EF4444', color: '#fff',
                fontSize: 9, fontWeight: 800,
                width: 14, height: 14, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {unreadCount}
              </span>
            )}
          </span>
          {!collapsed && (
            <span className="sidebar-nav-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
              {item.label}
              {item.id === 'notifications' && unreadCount > 0 && (
                <span style={{
                  background: '#EF4444', color: '#fff',
                  fontSize: 10, fontWeight: 800,
                  padding: '1px 6px', borderRadius: 10,
                }}>
                  {unreadCount}
                </span>
              )}
            </span>
          )}
        </div>
      ))}
    </div>

    <div className="sidebar-bottom">
      {!collapsed && <div className="sidebar-section-label">Account</div>}
      {([
        { id: 'profile'  as PageId, icon: '👤', label: 'Profile'  },
        { id: 'settings' as PageId, icon: '⚙️', label: 'Settings' },
      ]).map(item => (
        <div
          key={item.id}
          className={`sidebar-nav-item ${activePage === item.id ? 'active' : ''}`}
          onClick={() => setActivePage(item.id)}
          title={collapsed ? item.label : undefined}
        >
          <span className="sidebar-nav-icon">{item.icon}</span>
          {!collapsed && <span className="sidebar-nav-label">{item.label}</span>}
        </div>
      ))}
      <div
        className="sidebar-nav-item"
        onClick={onLogout}
        title={collapsed ? 'Logout' : undefined}
        style={{ color: 'rgba(239,68,68,0.6)' }}
      >
        <span className="sidebar-nav-icon">🚪</span>
        {!collapsed && <span className="sidebar-nav-label">Logout</span>}
      </div>
    </div>
  </div>
)

export default Sidebar