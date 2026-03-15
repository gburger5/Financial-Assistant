import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import StatCard from '../../features/StatCard'
import { DollarSign } from 'lucide-react'

describe('StatCard', () => {
  const baseProps = {
    icon: <DollarSign size={20} />,
    iconBg: '#8B5CF6',
    label: 'Monthly Income',
    value: '$5,000',
    change: '10%',
    positive: true,
  }

  it('displays label and value', () => {
    render(<StatCard {...baseProps} />)
    expect(screen.getByText('Monthly Income')).toBeInTheDocument()
    expect(screen.getByText('$5,000')).toBeInTheDocument()
  })

  it('shows up arrow for positive change', () => {
    render(<StatCard {...baseProps} positive={true} change="10%" />)
    expect(screen.getByText(/↑/)).toBeInTheDocument()
  })

  it('shows down arrow for negative change', () => {
    render(<StatCard {...baseProps} positive={false} change="5%" />)
    expect(screen.getByText(/↓/)).toBeInTheDocument()
  })
})
