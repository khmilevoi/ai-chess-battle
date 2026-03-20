import { memo, type ComponentType, type ReactNode } from 'react'
import { reatomComponent } from '@reatom/react'

export type ReatomMemoOptions =
  | string
  | {
      deps?: Array<string>
      name?: string
    }

export function reatomMemo<Props extends object>(
  Component: (props: Props) => ReactNode,
  options?: ReatomMemoOptions,
): ComponentType<Props> {
  const MemoComponent = memo(reatomComponent(Component, options)) as ComponentType<Props> & {
    displayName?: string
  }
  const fallbackName = Component.name || 'ReatomMemo'

  MemoComponent.displayName =
    typeof options === 'string' ? options : options?.name ?? fallbackName

  return MemoComponent
}
