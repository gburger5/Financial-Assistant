import './Avatar.css'

interface AvatarProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
  src?: string
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export default function Avatar({ name, size = 'md', src }: AvatarProps) {
  return (
    <div className={`avatar avatar--${size}`} aria-label={name}>
      {src ? (
        <img src={src} alt={name} className="avatar__img" />
      ) : (
        <span className="avatar__initials">{getInitials(name)}</span>
      )}
    </div>
  )
}
