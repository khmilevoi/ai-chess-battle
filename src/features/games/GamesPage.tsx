import { Button, PrimaryButton, SecondaryButton } from '@/shared/ui/Button'
import { reatomMemo } from '@/shared/ui/reatomMemo'
import type { GamesFilterStatus, GamesSortKey, GamesModel } from './model'
import styles from './GamesPage.module.css'

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
}

const FILTER_OPTIONS: { value: GamesFilterStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'finished', label: 'Finished' },
]

const SORT_OPTIONS: { value: GamesSortKey; label: string }[] = [
  { value: 'updated', label: 'Last updated' },
  { value: 'created', label: 'Created' },
  { value: 'moves', label: 'Moves' },
  { value: 'status', label: 'Status' },
]

export const GamesPage = reatomMemo(({
  model,
}: {
  model: GamesModel
}) => {
  const games = model.filteredGameSummaries()
  const activeGameId = model.activeGameId()
  const filterStatus = model.filterStatusAtom()
  const sortKey = model.sortKeyAtom()
  const searchQuery = model.searchQueryAtom()

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <p className={styles.eyebrow}>Local archive</p>
          <h1 className={styles.title}>Saved games</h1>
          <p className={styles.subtitle}>
            Every local game is stored with config and move history. Open any record
            to replay it or continue from the last position when possible.
          </p>
        </div>
        <PrimaryButton
          className={styles.newMatchAction}
          onClick={() => {
            model.openSetup()
          }}
        >
          New Match
        </PrimaryButton>
      </header>

      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          {FILTER_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              className={[
                styles.filterButton,
                filterStatus === opt.value ? styles.filterButtonActive : '',
              ].join(' ')}
              aria-pressed={filterStatus === opt.value}
              onClick={() => model.filterStatusAtom.set(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        <div className={styles.sortGroup}>
          <label className={styles.sortLabel} htmlFor="games-sort">
            Sort
          </label>
          <select
            id="games-sort"
            className={styles.sortSelect}
            value={sortKey}
            onChange={(e) => model.sortKeyAtom.set(e.target.value as GamesSortKey)}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.searchGroup}>
          <input
            className={styles.searchInput}
            type="search"
            placeholder="Search by actor or result…"
            value={searchQuery}
            onChange={(e) => model.searchQueryAtom.set(e.target.value)}
            aria-label="Search games"
          />
        </div>
      </div>

      {games.length === 0 ? (
        <section className={styles.emptyState}>
          <h2 className={styles.emptyTitle}>No saved games yet</h2>
          <p className={styles.emptyCopy}>
            Start a match from setup to create the first local record.
          </p>
          <PrimaryButton
            className={styles.emptyAction}
            onClick={() => {
              model.openSetup()
            }}
          >
            New Match
          </PrimaryButton>
        </section>
      ) : (
        <div className={styles.grid}>
          {games.map((game) => (
            <article key={game.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <p className={styles.eyebrow}>
                    {game.config.white.actorKey} vs {game.config.black.actorKey}
                  </p>
                  <h2 className={styles.cardTitle}>
                    {game.isFinished ? 'Finished game' : 'In-progress game'}
                  </h2>
                </div>
                {activeGameId === game.id ? (
                  <span className={styles.activeBadge}>Active</span>
                ) : null}
              </div>

              <p className={styles.statusText}>{game.statusText}</p>

              <div className={styles.meta}>
                <span>{game.moveCount} moves</span>
                <span>{game.turn} turn</span>
                <span>{game.isFinished ? 'finished' : 'in progress'}</span>
              </div>

              <dl className={styles.timestamps}>
                <div>
                  <dt>Created</dt>
                  <dd>{formatDate(game.createdAt)}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatDate(game.updatedAt)}</dd>
                </div>
              </dl>

              <div className={styles.actions}>
                <SecondaryButton
                  className={styles.primaryAction}
                  onClick={() => {
                    model.openGame(game.id)
                  }}
                >
                  Open game
                </SecondaryButton>
                <Button
                  className={styles.deleteAction}
                  onClick={() => model.deleteGame(game.id)}
                  aria-label={`Delete game: ${game.config.white.actorKey} vs ${game.config.black.actorKey}`}
                >
                  Delete
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}, 'GamesPage')
