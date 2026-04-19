import { useEffect, useRef } from 'react'
import type { PieceSnapshot, PromotionPiece, Side } from '@/domain/chess/types'
import { PieceIcon } from '@/shared/ui/PieceIcon'
import styles from './PromotionPicker.module.css'

const PROMOTION_PIECES: { piece: PromotionPiece; type: PieceSnapshot['type']; label: string }[] = [
  { piece: 'q', type: 'queen', label: 'Queen' },
  { piece: 'r', type: 'rook', label: 'Rook' },
  { piece: 'b', type: 'bishop', label: 'Bishop' },
  { piece: 'n', type: 'knight', label: 'Knight' },
]

type PromotionPickerProps = {
  side: Side
  onResolve: (piece: PromotionPiece) => void
  onCancel: () => void
}

export function PromotionPicker({ side, onResolve, onCancel }: PromotionPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const firstButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    firstButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Choose promotion piece"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div ref={containerRef} className={styles.picker}>
        <p className={styles.title}>Promote pawn to</p>
        <div className={styles.options} role="group" aria-label="Promotion pieces">
          {PROMOTION_PIECES.map(({ piece, type, label }, index) => (
            <button
              key={piece}
              ref={index === 0 ? firstButtonRef : undefined}
              className={styles.option}
              onClick={() => onResolve(piece)}
              aria-label={label}
              title={label}
            >
              <div className={styles.iconWrap}>
                <PieceIcon piece={{ id: `promo-${piece}`, side, type, square: '' }} />
              </div>
              <span className={styles.label}>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
