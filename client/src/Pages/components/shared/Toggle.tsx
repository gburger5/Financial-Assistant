interface ToggleProps {
  on: boolean
  onToggle: () => void
}

const Toggle = ({ on, onToggle }: ToggleProps) => (
  <button className={`toggle-switch ${on ? 'on' : ''}`} onClick={onToggle} />
)

export default Toggle