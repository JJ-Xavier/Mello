// O que o card mostra no quadro (CAR-04): etiquetas, ✓, título, data de entrega e os ícones de
// descrição, checklist, nota e anexos. Prioridade, capa, repetição e "Modelo" entram nas etapas 4,
// 5, 8 e 11.
import type { CardSummary } from '../../../../shared/ipc/cards'
import { dueDate, isOverdue } from '../../../../shared/rules/dates'
import { DoneMark } from '../../components/DoneMark'
import { Icon } from '../../components/Icon'
import { cx } from '../../lib/cx'
import { formatShortDate } from '../../lib/format'
import styles from './CardFace.module.css'

interface CardFaceProps {
  card: CardSummary
  // FIN-01: na lista de conclusão e com o ✓. Decide a cor da data (DAT-03).
  finished: boolean
  now: number
}

function DueChip({ dueAt, finished, now }: { dueAt: string; finished: boolean; now: number }) {
  const late = isOverdue(dueAt, finished, now)
  return (
    <span className={cx(styles.chip, late && styles.late, finished && styles.finished)}>
      <Icon name="clock" size={14} />
      {formatShortDate(dueDate(dueAt).getTime())}
      {late && <span className="visually-hidden">, em atraso</span>}
      {finished && <span className="visually-hidden">, concluído</span>}
    </span>
  )
}

export function CardFace({ card, finished, now }: CardFaceProps) {
  const hasBadges =
    card.dueAt !== null ||
    card.hasDescription ||
    card.checkTotal > 0 ||
    card.hasNote ||
    card.attachmentCount > 0

  return (
    <div className={styles.in}>
      {card.labels.length > 0 && (
        <div className={styles.labels}>
          {card.labels.map((label) => (
            <span
              key={label.id}
              className={styles.label}
              style={{ background: label.color }}
              title={label.name ?? undefined}
            />
          ))}
        </div>
      )}
      <div className={styles.title}>
        {card.isDone && <DoneMark done />}
        <span>{card.title}</span>
      </div>
      {hasBadges && (
        <div className={styles.badges}>
          {card.dueAt !== null && <DueChip dueAt={card.dueAt} finished={finished} now={now} />}
          {card.hasDescription && (
            <span
              className={styles.badge}
              role="img"
              aria-label="Tem descrição"
              title="Tem descrição"
            >
              <Icon name="description" />
            </span>
          )}
          {card.checkTotal > 0 && (
            <span
              className={styles.badge}
              title="Checklist"
              aria-label={`Checklist: ${card.checkDone} de ${card.checkTotal}`}
              role="img"
            >
              <Icon name="checklist" />
              {card.checkDone}/{card.checkTotal}
            </span>
          )}
          {card.hasNote && (
            <span className={styles.badge} role="img" aria-label="Tem nota" title="Tem nota">
              <Icon name="note" />
            </span>
          )}
          {card.attachmentCount > 0 && (
            <span
              className={styles.badge}
              role="img"
              aria-label={`${card.attachmentCount} ${card.attachmentCount === 1 ? 'anexo' : 'anexos'}`}
              title="Anexos"
            >
              <Icon name="attachment" />
              {card.attachmentCount}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
