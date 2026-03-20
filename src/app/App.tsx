import { reatomComponent } from '@reatom/react'
import { rootRoute } from './routes'

export const App = reatomComponent(() => {
  return rootRoute.render()
}, 'App')
