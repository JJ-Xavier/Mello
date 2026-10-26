// Os itens de um dia do calendário (Calendario.dc.html e NovoCalendarioTodos.dc.html). Card:
// etiquetas, ✓, relógio de atraso (CAL-08), título, ↻, prioridade e, em todos os quadros, o nome
// do quadro (CAL-14); clicar abre o modal por cima (CAL-11). Tarefa: caixa de marcar, texto e o
// card de origem (CAL-14); clicar marca ou desmarca (CAL-11). Repetição que não virou card
// (REP-14): tracejada, com o aviso embaixo; clicar abre o card mais recente da série.
import { Link } from 'react-router'
import type { CalendarCard, CalendarRepeat, CalendarTask } from '../../../../shared/ipc/calendar'
import { isOverdue } from '../../../../shared/rules/dates'
import { priorityLevel } from '../../../../shared/rules/priority'
import { DoneMark } from '../../components/DoneMark'
import { Icon } from '../../components/Icon'
import { PriorityIcon } from '../../components/PriorityIcon'
import { api, unwrap } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useAction } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import styles from './Calendar.module.css'

export type DayItem =
  | { kind: 'card'; id: string; card: CalendarCard }
  | { kind: 'task'; id: string; task: CalendarTask }
  | { kind: 'repeat'; id: string; repeat: CalendarRepeat }

export interface ItemOptions {
  now: number
  // "Riscar itens finalizados" (CAL-07).
  strike: boolean
  // Calendário de todos os quadros: os cards mostram o quadro e as tarefas, "card · quadro".
  allBoards: boolean
}

function CardItem({ card, now, strike, allBoards }: { card: CalendarCard } & ItemOptions) {
  const late = isOverdue(card.dueAt, card.finished, now)
  const priority = priorityLevel(card.priority)
  const label = [
    `Abrir card ${card.title}`,
    allBoards && card.boardTitle,
    late && 'em atraso',
    card.finished && 'finalizado'
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <Link
      to={{ search: `?card=${card.id}` }}
      className={cx(styles.card, allBoards && styles.cardAll)}
      aria-label={label}
    >
      {card.labels.length > 0 && (
        <span className={styles.labels}>
          {card.labels.map((l) => (
            <span key={l.id} className={styles.label} style={{ background: l.color }} />
          ))}
        </span>
      )}
      <span className={cx(styles.cardRow, strike && card.finished && styles.struck)}>
        {card.isDone && <DoneMark done />}
        {late && (
          <span className={styles.late}>
            <Icon name="clock" size={14} />
          </span>
        )}
        <span className={styles.text}>{card.title}</span>
        {card.recurring && (
          <span className={styles.repeat}>
            <Icon name="repeat" size={13} />
          </span>
        )}
        {priority && (
          <span className={styles.priority} title={`Prioridade ${priority.name.toLowerCase()}`}>
            <PriorityIcon value={priority.value} size={15} />
          </span>
        )}
      </span>
      {allBoards && <span className={styles.sub}>{card.boardTitle}</span>}
    </Link>
  )
}

function TaskBox({ done }: { done: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style={{ flex: 'none' }}>
      {done ? (
        <>
          <rect x="2" y="2" width="20" height="20" rx="4" fill="var(--accent)" />
          <path
            d="m7 12.5 3.2 3.2L17 9"
            fill="none"
            stroke="var(--accent-txt)"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <rect
          x="3"
          y="3"
          width="18"
          height="18"
          rx="4"
          fill="none"
          stroke="var(--muted)"
          strokeWidth="2"
        />
      )}
    </svg>
  )
}

function TaskItem({ task, now, strike, allBoards }: { task: CalendarTask } & ItemOptions) {
  const run = useAction()
  const late = isOverdue(task.dueDate, task.isDone, now)
  const struck = strike && task.isDone
  // Marcar pelo calendário zera o envelhecimento do card (ENV-05), como no modal.
  const toggle = () =>
    run(
      () => unwrap(api().items.toggle({ itemId: task.id, isDone: !task.isDone })),
      [queryKeys.card(task.cardId), queryKeys.board(task.boardId)]
    )
  return (
    <button
      type="button"
      className={styles.task}
      aria-pressed={task.isDone}
      aria-label={`${task.isDone ? 'Desmarcar' : 'Concluir'} tarefa ${task.text}`}
      onClick={() => void toggle()}
    >
      <TaskBox done={task.isDone} />
      <span className={styles.taskText}>
        <span className={cx(styles.text, late && styles.lateText, struck && styles.struck)}>
          {task.text}
        </span>
        <span className={cx(styles.sub, struck && styles.struckLine)}>
          {allBoards ? `${task.cardTitle} · ${task.boardTitle}` : task.cardTitle}
        </span>
      </span>
    </button>
  )
}

const REPEAT_NOTES: Record<CalendarRepeat['kind'], string> = {
  next: 'Próxima repetição',
  skipped: 'Pulada: a anterior está em aberto',
  missed: 'Não criada: app fechado'
}

function RepeatItem({ repeat, allBoards }: { repeat: CalendarRepeat } & ItemOptions) {
  const priority = priorityLevel(repeat.priority)
  const note = REPEAT_NOTES[repeat.kind]
  return (
    <Link
      to={{ search: `?card=${repeat.cardId}` }}
      className={cx(styles.card, styles.ghost, allBoards && styles.cardAll)}
      aria-label={[repeat.title, allBoards && repeat.boardTitle, note].filter(Boolean).join(', ')}
    >
      {repeat.labels.length > 0 && (
        <span className={styles.labels}>
          {repeat.labels.map((l) => (
            <span key={l.id} className={styles.label} style={{ background: l.color }} />
          ))}
        </span>
      )}
      <span className={styles.cardRow}>
        <span className={styles.text}>{repeat.title}</span>
        <span className={styles.repeat}>
          <Icon name="repeat" size={13} />
        </span>
        {priority && (
          <span className={styles.priority} title={`Prioridade ${priority.name.toLowerCase()}`}>
            <PriorityIcon value={priority.value} size={15} />
          </span>
        )}
      </span>
      {allBoards && <span className={styles.sub}>{repeat.boardTitle}</span>}
      <span className={styles.ghostNote}>{note}</span>
    </Link>
  )
}

export function CalendarItem({ item, ...options }: { item: DayItem } & ItemOptions) {
  if (item.kind === 'card') return <CardItem card={item.card} {...options} />
  if (item.kind === 'repeat') return <RepeatItem repeat={item.repeat} {...options} />
  return <TaskItem task={item.task} {...options} />
}
