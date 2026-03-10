import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Card from '../Card'

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Hello card</Card>)
    expect(screen.getByText('Hello card')).toBeInTheDocument()
  })

  it('adds hoverable class when hoverable prop is set', () => {
    const { container } = render(<Card hoverable>Content</Card>)
    expect(container.firstChild).toHaveClass('card--hoverable')
  })

  it('does not add hoverable class by default', () => {
    const { container } = render(<Card>Content</Card>)
    expect(container.firstChild).not.toHaveClass('card--hoverable')
  })
})
