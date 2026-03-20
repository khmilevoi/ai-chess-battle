import { rootRoute } from './routes'
import { reatomMemo } from '../shared/ui/reatomMemo'

export const App = reatomMemo(() => {
  return rootRoute.render()
}, 'App')
