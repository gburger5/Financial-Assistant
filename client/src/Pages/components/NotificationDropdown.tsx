import { useRef, useEffect } from 'react'
import type { Notification } from '../types/dashboard'

interface NotificationsDropdownProps {
  notifications: Notification[]
  onMarkAll: () => void
  onMarkOne: (id: number) => void
  onViewAll: () => void
  onClose: () => void
}

const NotificationsDropdown = ({ notifications, onMarkAll, onMarkOne, onViewAll, onClose }: NotificationsDropdownProps) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div className="notif-dropdown" ref={ref}>
      <div className="notif-dropdown-header">
        <span className="notif-dropdown-title">
          Notifications
          {notifications.filter(n => n.unread).length > 0 && (
            <span className="notif-count-badge">{notifications.filter(n => n.unread).length}</span>
          )}
        </span>
        <button className="notif-mark-all" onClick={onMarkAll}>Mark all read</button>
      </div>
      <div className="notif-list">
        {notifications.map(n => (
          <div key={n.id} className={`notif-item ${n.unread ? 'unread' : ''}`} onClick={() => onMarkOne(n.id)}>
            <div className="notif-item-icon" style={{ background: n.iconBg }}>{n.icon}</div>
            <div className="notif-item-body">
              <div className="notif-item-title">{n.title}</div>
              <div className="notif-item-desc">{n.desc}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
              <span className="notif-item-time">{n.time}</span>
              {n.unread && <div className="notif-unread-dot" />}
            </div>
          </div>
        ))}
      </div>
      <div className="notif-dropdown-footer">
        <button className="notif-view-all-btn" onClick={onViewAll}>View all notifications →</button>
      </div>
    </div>
  )
}

export default NotificationsDropdown