import './FilterChips.css'

interface FilterChipsProps {
  options: string[]
  selected: string
  onChange: (value: string) => void
}

export default function FilterChips({ options, selected, onChange }: FilterChipsProps) {
  return (
    <div className="filter-chips" role="group">
      {options.map((opt) => (
        <button
          key={opt}
          className={['filter-chip', opt === selected ? 'filter-chip--active' : ''].filter(Boolean).join(' ')}
          onClick={() => onChange(opt)}
          aria-pressed={opt === selected}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}
