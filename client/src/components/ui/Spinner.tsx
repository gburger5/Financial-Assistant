import './Spinner.css'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
}

export default function Spinner({ size = 'md' }: SpinnerProps) {
  return <div className={`spinner spinner--${size}`} role="status" aria-label="Loading" />
}
