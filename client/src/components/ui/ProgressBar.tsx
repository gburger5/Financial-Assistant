import './ProgressBar.css'

interface ProgressBarProps {
  value: number
  color?: string
}

export default function ProgressBar({ value, color }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value))

  return (
    <div className="progress-bar" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
      <div
        className="progress-bar__fill"
        style={{ width: `${clamped}%`, background: color ?? 'var(--gradient-primary)' }}
      />
    </div>
  )
}
