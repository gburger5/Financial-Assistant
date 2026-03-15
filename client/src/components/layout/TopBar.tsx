import { Bell } from 'lucide-react'
import Avatar from '../ui/Avatar'
import './TopBar.css'

interface TopBarProps {
  title: string
  userName: string
}

export default function TopBar({ title, userName }: TopBarProps) {
  return (
    <header className="topbar">
      <h1 className="topbar__title">{title}</h1>
      <div className="topbar__right">
        <button className="topbar__bell" aria-label="Notifications">
          <Bell size={20} />
        </button>
        <div className="topbar__user">
          <Avatar name={userName} size="sm" />
          <span className="topbar__user-name">{userName}</span>
        </div>
      </div>
    </header>
  )
}
