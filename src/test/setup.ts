import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { context, urlAtom } from '@reatom/core'
import { afterEach } from 'vitest'

urlAtom.init()

afterEach(() => {
  cleanup()
  context.reset()
  urlAtom.init()
})
