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
        <div className="topbar__user">
          <Avatar name={userName} size="sm" />
          <span className="topbar__user-name">{userName}</span>
        </div>
      </div>
    </header>
  )
}