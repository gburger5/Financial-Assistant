import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import EmptyState from '../EmptyState'
import Button from '../Button'

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="Nothing here" />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    render(<EmptyState title="Empty" description="No data available" />)
    expect(screen.getByText('No data available')).toBeInTheDocument()
  })

  it('renders action when provided', () => {
    render(
      <EmptyState
        title="Empty"
        action={<Button>Add item</Button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument()
  })
})
