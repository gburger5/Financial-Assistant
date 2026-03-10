import './Toggle.css'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export default function Toggle({ checked, onChange, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={['toggle', checked ? 'toggle--on' : ''].filter(Boolean).join(' ')}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__thumb" />
    </button>
  )
}
