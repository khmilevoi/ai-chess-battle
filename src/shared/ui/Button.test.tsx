import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button, PrimaryButton, SecondaryButton } from './Button'

describe('shared Button components', () => {
  it('render native buttons and default to type button', () => {
    render(
      <>
        <Button>Back to setup</Button>
        <PrimaryButton>Start Match</PrimaryButton>
        <SecondaryButton>Resume Match</SecondaryButton>
      </>,
    )

    expect(screen.getByRole('button', { name: 'Back to setup' })).toHaveAttribute(
      'type',
      'button',
    )
    expect(screen.getByRole('button', { name: 'Start Match' })).toHaveAttribute(
      'type',
      'button',
    )
    expect(screen.getByRole('button', { name: 'Resume Match' })).toHaveAttribute(
      'type',
      'button',
    )
  })

  it('forwards native props and click handlers', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    render(
      <PrimaryButton type="submit" className="custom-class" onClick={onClick}>
        Start Match
      </PrimaryButton>,
    )

    const button = screen.getByRole('button', { name: 'Start Match' })

    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveAttribute('type', 'submit')
    expect(button).toHaveClass('custom-class')

    await user.click(button)

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('preserves disabled behavior', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    render(
      <Button disabled onClick={onClick}>
        Send OpenAI request
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Send OpenAI request' })

    expect(button).toBeDisabled()

    await user.click(button)

    expect(onClick).not.toHaveBeenCalled()
  })
})
