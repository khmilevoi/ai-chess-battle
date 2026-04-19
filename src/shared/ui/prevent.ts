import type { SyntheticEvent } from 'react'

export const prevent =
  <T extends SyntheticEvent>(callback: (event: T) => unknown) =>
  (event: T) => {
    event.preventDefault()
    return callback(event)
  }
