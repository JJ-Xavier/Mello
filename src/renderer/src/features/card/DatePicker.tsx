// Seletor de data (NovoDataHoraA.dc.html, aprovada em 28/10/2026), do card e da tarefa: o mês, a
// data e a hora (opcional, DAT-01), os horários prontos e, embaixo, se fica no prazo ou em atraso
// (DAT-05). O do card tem também o lembrete (LEM-01), que o agendador dispara (LEM-03).
import { useState, type FormEvent, type ReactNode } from 'react'
import type { Reminder } from '../../../../shared/ipc/cards'
import {
  dayOf,
  dueStatus,
  formatDayInput,
  joinDue,
  monthGrid,
  parseDayInput,
  parseTimeInput,
  splitDue,
  type DueStatus
} from '../../../../shared/rules/dates'
import { reminderPreview } from '../../../../shared/rules/reminders'
import { Icon } from '../../components/Icon'
import { PopoverHeader } from '../../components/Popover'
import ui from '../../components/ui.module.css'
import { clockNow } from '../../lib/clock'
import { cx } from '../../lib/cx'
import { formatMonth } from '../../lib/format'
import { useNow } from '../../lib/useNow'
import styles from './CardModal.module.css'

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

const REMINDER_OPTIONS: { value: Reminder; label: string }[] = [
  { value: 'none', label: 'Nenhum' },
  { value: 'at_time', label: 'No horário' },
  { value: 'day_before', label: '1 dia antes' }
]

// Os horários prontos; null é "Sem hora" (vence no fim do dia, DAT-02).
const TIMES = ['09:00', '12:00', '18:00', null]

const STATUS_LABEL: Record<DueStatus['kind'], string> = {
  onTime: 'No prazo',
  late: 'Em atraso',
  done: 'Concluído'
}

const STATUS_CLASS: Record<DueStatus['kind'], string | undefined> = {
  onTime: styles.tagOnTime,
  late: styles.tagLate,
  done: styles.tagDone
}

// DAT-05: o selo "No prazo", "Em atraso" ou "Concluído", no modal e embaixo do seletor.
export function StatusTag({ status }: { status: DueStatus }) {
  return (
    <span className={cx(styles.statusTag, STATUS_CLASS[status.kind])}>
      {STATUS_LABEL[status.kind]}
    </span>
  )
}

// A grade do mês, de domingo a sábado, começando no mês de `initial` (ou no de hoje), com hoje
// marcado. Clicar num dia escolhe a data.
export function MonthGrid({
  selected,
  onPick,
  initial
}: {
  selected: string | null
  onPick: (day: string) => void
  initial: string | null
}) {
  const today = dayOf(useNow())
  const [view, setView] = useState(() => {
    const [year, month] = (initial ?? dayOf(clockNow())).split('-').map(Number) as [number, number]
    return { year, month }
  })
  const shift = (delta: number) => {
    const date = new Date(view.year, view.month - 1 + delta, 1)
    setView({ year: date.getFullYear(), month: date.getMonth() + 1 })
  }
  return (
    <div className={styles.calendar}>
      <div className={styles.calendarHead}>
        <button
          type="button"
          className={styles.monthButton}
          aria-label="Mês anterior"
          onClick={() => shift(-1)}
        >
          <Icon name="chevronLeft" />
        </button>
        <span className={styles.monthName}>{formatMonth(view.year, view.month)}</span>
        <button
          type="button"
          className={styles.monthButton}
          aria-label="Próximo mês"
          onClick={() => shift(1)}
        >
          <Icon name="chevronRight" />
        </button>
      </div>
      <div className={styles.days}>
        {WEEKDAYS.map((w, i) => (
          <span key={i} className={styles.weekday} aria-hidden="true">
            {w}
          </span>
        ))}
        {monthGrid(view.year, view.month)
          .flat()
          .map(({ day, inMonth }) => (
            <button
              key={day}
              type="button"
              className={cx(
                styles.day,
                !inMonth && styles.dayOut,
                day === today && styles.dayToday,
                day === selected && styles.daySelected
              )}
              aria-label={`${formatDayInput(day)}${day === today ? ', hoje' : ''}`}
              aria-pressed={day === selected}
              onClick={() => onPick(day)}
            >
              {Number(day.slice(8))}
            </button>
          ))}
      </div>
    </div>
  )
}

// O formulário das duas telas. `top` vem antes da grade (o texto da tarefa); `bottom` depois da
// linha de status, com a data que está sendo escolhida (o lembrete, "Mostrar no calendário").
export function DueForm({
  title,
  dayLabel,
  dueAt,
  finished,
  top,
  bottom,
  onSave,
  onRemove,
  close,
  onBack
}: {
  title: string
  dayLabel: string
  dueAt: string | null
  finished: boolean
  top?: ReactNode
  bottom?: (draft: string | null, now: number) => ReactNode
  onSave: (dueAt: string) => void
  onRemove: () => void
  close: () => void
  onBack?: () => void
}) {
  const now = useNow()
  const current = dueAt ? splitDue(dueAt) : null
  const [dayText, setDayText] = useState(current ? formatDayInput(current.day) : '')
  const [timeText, setTimeText] = useState(current?.time ?? '')
  const [error, setError] = useState('')
  const day = parseDayInput(dayText)
  const noTime = timeText.trim() === ''
  const time = noTime ? null : parseTimeInput(timeText)
  const draft = day && (noTime || time) ? joinDue(day, time) : null
  const status = draft ? dueStatus(draft, finished, now) : null

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!day) return setError('Data inválida. Use dd/mm/aaaa.')
    if (time === null && !noTime) return setError('Hora inválida. Use hh:mm.')
    close()
    onSave(joinDue(day, time))
  }

  // Um horário pronto sem dia escolhido vale para hoje.
  const pickTime = (picked: string | null) => {
    setTimeText(picked ?? '')
    if (!day) setDayText(formatDayInput(dayOf(now)))
    setError('')
  }

  return (
    <form className={styles.stack} style={{ gap: 10 }} onSubmit={save}>
      <PopoverHeader title={title} onClose={close} onBack={onBack} />
      {top}
      <MonthGrid
        selected={day}
        initial={day ?? current?.day ?? null}
        onPick={(picked) => {
          setDayText(formatDayInput(picked))
          setError('')
        }}
      />
      <div className={styles.fieldRow}>
        <label className={cx(ui.label, styles.grow)}>
          {dayLabel}
          <input
            className={ui.fld}
            value={dayText}
            placeholder="dd/mm/aaaa"
            onChange={(event) => {
              setDayText(event.target.value)
              setError('')
            }}
          />
        </label>
        <label className={ui.label} style={{ width: 90 }}>
          Hora
          <input
            className={ui.fld}
            value={timeText}
            placeholder="hh:mm"
            onChange={(event) => {
              setTimeText(event.target.value)
              setError('')
            }}
          />
        </label>
      </div>
      <div className={styles.timeChips} role="group" aria-label="Horários prontos">
        {TIMES.map((t) => (
          <button
            key={t ?? 'none'}
            type="button"
            className={styles.timeChip}
            aria-pressed={day !== null && (t === null ? noTime : time === t)}
            onClick={() => pickTime(t)}
          >
            {t ?? 'Sem hora'}
          </button>
        ))}
      </div>
      <p className={styles.dueStatus} role="status">
        {status ? (
          <>
            <StatusTag status={status} />
            {status.text}
          </>
        ) : dayText.trim() === '' ? (
          'Sem data de entrega'
        ) : (
          'Confira a data e a hora'
        )}
      </p>
      {bottom?.(draft, now)}
      {error && (
        <p className={cx(ui.note, ui.danger)} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className={ui.pri}>
        Salvar
      </button>
      {dueAt && (
        <button
          type="button"
          className={ui.sec}
          onClick={() => {
            close()
            onRemove()
          }}
        >
          Remover
        </button>
      )}
    </form>
  )
}

export function DatePicker({
  dueAt,
  reminder,
  finished,
  onSave,
  close,
  onBack
}: {
  dueAt: string | null
  reminder: Reminder
  finished: boolean
  onSave: (due: { dueAt: string | null; reminder: Reminder }) => void
  close: () => void
  onBack?: () => void
}) {
  const [remind, setRemind] = useState<Reminder>(reminder)

  return (
    <DueForm
      title="Datas"
      dayLabel="Data de entrega"
      dueAt={dueAt}
      finished={finished}
      bottom={(draft, now) => {
        const preview = reminderPreview(draft, remind, now)
        return (
          <>
            <label className={ui.label}>
              Lembrete
              <select
                className={ui.fld}
                value={remind}
                onChange={(event) => setRemind(event.target.value as Reminder)}
              >
                {REMINDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {preview && (
              <p className={styles.reminderNote}>
                <Icon name="bell" size={14} />
                Notificação: {preview}
              </p>
            )}
          </>
        )
      }}
      onSave={(due) => onSave({ dueAt: due, reminder: remind })}
      onRemove={() => onSave({ dueAt: null, reminder: 'none' })}
      close={close}
      onBack={onBack}
    />
  )
}
