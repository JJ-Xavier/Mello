// O que o card mostra no quadro (CAR-04): capa, etiquetas, ✓, título, data de entrega, os ícones
// de descrição, checklist, nota e anexos, a repetição (REP-13), a prioridade e o selo "Modelo"
// (MOD-02).
import type { CardSummary } from '../../../../shared/ipc/cards'
import { isOverdue } from '../../../../shared/rules/dates'
import { priorityLevel } from '../../../../shared/rules/priority'
import { nextRepeatText } from '../../../../shared/rules/recurrence'
import { Cover } from '../../components/Cover'
import { DoneMark } from '../../components/DoneMark'
import { Icon } from '../../components/Icon'
import { PriorityIcon } from '../../components/PriorityIcon'
import { cx } from '../../lib/cx'
import { formatDue } from '../../lib/format'
import styles from './CardFace.module.css'

interface CardFaceProps {
  card: CardSummary
  // FIN-01: na lista de conclusão e com o ✓. Decide a cor da data (DAT-03).
  finished: boolean
  now: number
  // Card envelhecido (ENV-09): o leitor de tela ouve há quantos dias ele está parado.
  idleDays?: number | null
}

function DueChip({ dueAt, finished, now }: { dueAt: string; finished: boolean; now: number }) {
  const late = isOverdue(dueAt, finished, now)
  return (
    <span className={cx(styles.chip, late && styles.late, finished && styles.finished)}>
      <Icon name="clock" size={14} />
      {formatDue(dueAt)}
      {late && <span className="visually-hidden">, em atraso</span>}
      {finished && <span className="visually-hidden">, concluído</span>}
    </span>
  )
}

// REP-13: ↻ e o próximo dia ("seg." nos próximos 6 dias, "26 out." depois). Pausada (REP-16), só
// o ↻.
function RepeatBadge({ next, now }: { next: string | null; now: number }) {
  const text = next ? nextRepeatText(next, now) : null
  return (
    <span
      className={styles.badge}
      role="img"
      aria-label={text ? `Card recorrente, próxima ${text}` : 'Card recorrente, repetição pausada'}
      title={text ? 'Card recorrente' : 'Repetição pausada'}
    >
      <Icon name="repeat" />
      {text}
    </span>
  )
}

export function CardFace({ card, finished, now, idleDays = null }: CardFaceProps) {
  const priority = priorityLevel(card.priority)
  const hasBadges =
    priority !== null ||
    card.dueAt !== null ||
    card.hasDescription ||
    card.checkTotal > 0 ||
    card.hasNote ||
    card.attachmentCount > 0 ||
    card.recurring

  return (
    <>
      {card.cover && <Cover cover={card.cover} className={styles.cover} />}
      <div className={styles.in}>
        {card.isTemplate && (
          <span className={styles.template}>
            <Icon name="template" size={12} />
            Modelo
          </span>
        )}
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
          <span>
            {card.title}
            {idleDays !== null && (
              <span className="visually-hidden">, parado há {idleDays} dias</span>
            )}
          </span>
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
            {card.recurring && <RepeatBadge next={card.nextRepeat} now={now} />}
            {priority && (
              <span
                className={styles.priority}
                role="img"
                aria-label={`Prioridade ${priority.name.toLowerCase()}`}
                title={`Prioridade ${priority.name.toLowerCase()}`}
              >
                <PriorityIcon value={priority.value} />
              </span>
            )}
          </div>
        )}
      </div>
    </>
  )
}
