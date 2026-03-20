import type { JSX } from 'react'

declare module '@reatom/core' {
  interface RouteChild extends JSX.Element {
    readonly __reactRouteChildBrand?: never
  }
}

export {}
