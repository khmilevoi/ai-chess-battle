import clsx from 'clsx'
import type { ReactNode } from 'react'

type LinkProps = {
  path: string
  match?: boolean
  classes?: { default?: string; active?: string }
  children: ReactNode
}

export function Link({ path, match, classes, children }: LinkProps) {
  return (
    <a
      href={path}
      className={clsx(classes?.default, match && classes?.active)}
      aria-current={match ? 'page' : undefined}
    >
      {children}
    </a>
  )
}
