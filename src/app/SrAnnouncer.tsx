import { useEffect, useRef } from 'react'
import { action, atom } from '@reatom/core'
import { reatomMemo } from '@/shared/ui/reatomMemo'

type Politeness = 'polite' | 'assertive'

type SrAnnouncement = {
  message: string
  politeness: Politeness
}

export const srAnnouncementAtom = atom<SrAnnouncement | null>(null, 'app.srAnnouncement')

export const announce = action((message: string, politeness: Politeness = 'polite') => {
  srAnnouncementAtom.set({ message, politeness })
  return message
}, 'app.announce')

export const SrAnnouncer = reatomMemo(() => {
  const announcement = srAnnouncementAtom()
  const politeRef = useRef<HTMLDivElement>(null)
  const assertiveRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!announcement) return

    const el = announcement.politeness === 'assertive' ? assertiveRef.current : politeRef.current
    if (!el) return
    el.textContent = ''
    requestAnimationFrame(() => {
      el.textContent = announcement.message
    })
  }, [announcement])

  return (
    <>
      <div
        ref={politeRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}
      />
      <div
        ref={assertiveRef}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}
      />
    </>
  )
}, 'SrAnnouncer')
