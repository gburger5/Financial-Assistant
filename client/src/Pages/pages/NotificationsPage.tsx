import { useState } from 'react'
import type { Notification } from '../types/dashboard'

interface NotificationsPageProps {
  notifications: Notification[]
  markAll: () => void
  markOne: (id: number) => void
}

const NotificationsPage = ({ notifications, markAll, markOne }: NotificationsPageProps) => {
  const [filter, setFilter] = useState('All')

  const filtered = filter === 'All' ? notifications
    : notifications.filter(n => {
        if (filter === 'Alerts')  return n.type === 'alert'
        if (filter === 'Tips')    return n.type === 'tip'
        if (filter === 'Updates') return n.type === 'update' || n.type === 'action'
        return true
      })

  return (
    <div>
      <div className="inner-page-header">
        <div>
          <div className="page-title">Notifications</div>
          <div className="page-subtitle">{notifications.filter(n => n.unread).length} unread</div>
        </div>
        <button className="btn-outline" onClick={markAll}>Mark all as read</button>
      </div>

      <div className="filter-row">
        {['All', 'Alerts', 'Tips', 'Updates'].map(t => (
          <button key={t} className={`filter-chip ${filter === t ? 'active' : ''}`} onClick={() => setFilter(t)}>{t}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {filtered.map(n => (
          <div key={n.id} className={`notif-page-item ${n.unread ? 'unread' : ''}`} onClick={() => markOne(n.id)}>
            <div className="notif-item-icon" style={{ background: n.iconBg }}>{n.icon}</div>
            <div className="notif-item-body">
              <div className="notif-item-title">{n.title}</div>
              <div className="notif-item-desc">{n.desc}</div>
              <div className="notif-item-time" style={{ marginTop: 5 }}>{n.time}</div>
            </div>
            {n.unread && <div className="notif-unread-dot" style={{ marginTop: 4 }} />}
          </div>
        ))}
      </div>
    </div>
  )
}

export default NotificationsPage