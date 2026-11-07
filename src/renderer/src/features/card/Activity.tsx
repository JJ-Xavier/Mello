// Atividade do card (ATV-01): recolhida embaixo da nota, com a quantidade de registros. Aberta,
// lista do mais recente para o mais antigo, com data e hora. O mais recente tem o ponto azul.
import { useId, useState } from 'react'
import type { ActivityEntry } from '../../../../shared/ipc/cards'
import { activityCount, activityText } from '../../../../shared/rules/activity'
import { Icon } from '../../components/Icon'
import { cx } from '../../lib/cx'
import { formatDateTime } from '../../lib/format'
import styles from './CardModal.module.css'

export function Activity({ entries }: { entries: ActivityEntry[] }) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  return (
    <div className={styles.activity}>
      <button
        type="button"
        className={styles.activityToggle}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
      >
        <Icon name={open ? 'chevronDown' : 'chevronRight'} />
        <span className={styles.grow}>Atividade</span>
        <span className={styles.activityCount}>{activityCount(entries.length)}</span>
      </button>
      {open && (
        <ol id={listId} className={styles.activityList}>
          {entries.map((entry, index) => (
            <li key={entry.id} className={styles.activityEntry}>
              <span className={cx(styles.activityDot, index === 0 && styles.activityRecent)} />
              <span>
                {activityText(entry)}
                <span className={styles.activityDate}>{formatDateTime(entry.createdAt)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
