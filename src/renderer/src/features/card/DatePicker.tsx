// Seletor de data de entrega (Estados.dc.html): o mês, a data e a hora (opcional, DAT-01) e o
// lembrete (LEM-01). O lembrete é guardado agora e passa a disparar na etapa 8.
import { useState, type FormEvent } from 'react'
import type { Reminder } from '../../../../shared/ipc/cards'
import {
  dayOf,
  formatDayInput,
  joinDue,
  monthGrid,
  parseDayInput,
  parseTimeInput,
  splitDue
} from '../../../../shared/rules/dates'
import { Icon } from '../../components/Icon'
import { PopoverHeader } from '../../components/Popover'
import ui from '../../components/ui.module.css'
import { clockNow } from '../../lib/clock'
import { cx } from '../../lib/cx'
import { formatMonth } from '../../lib/format'
import styles from './CardModal.module.css'

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

const REMINDER_OPTIONS: { value: Reminder; label: string }[] = [
  { value: 'none', label: 'Nenhum' },
  { value: 'at_time', label: 'No horário' },
  { value: 'day_before', label: '1 dia antes' }
]

// A grade do mês, de domingo a sábado, começando no mês de `initial` (ou no de hoje). Clicar num
// dia escolhe a data.
export function MonthGrid({
  selected,
  onPick,
  initial
}: {
  selected: string | null
  onPick: (day: string) => void
  initial: string | null
}) {
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
                day === selected && styles.daySelected
              )}
              aria-label={formatDayInput(day)}
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

export function DatePicker({
  dueAt,
  reminder,
  onSave,
  close,
  onBack
}: {
  dueAt: string | null
  reminder: Reminder
  onSave: (due: { dueAt: string | null; reminder: Reminder }) => void
  close: () => void
  onBack?: () => void
}) {
  const current = dueAt ? splitDue(dueAt) : null
  const [dayText, setDayText] = useState(current ? formatDayInput(current.day) : '')
  const [timeText, setTimeText] = useState(current?.time ?? '')
  const [remind, setRemind] = useState<Reminder>(reminder)
  const [error, setError] = useState('')
  const day = parseDayInput(dayText)

  const save = (event: FormEvent) => {
    event.preventDefault()
    const time = timeText.trim() === '' ? null : parseTimeInput(timeText)
    if (!day) return setError('Data inválida. Use dd/mm/aaaa.')
    if (time === null && timeText.trim() !== '') return setError('Hora inválida. Use hh:mm.')
    close()
    onSave({ dueAt: joinDue(day, time), reminder: remind })
  }

  const remove = () => {
    close()
    onSave({ dueAt: null, reminder: 'none' })
  }

  return (
    <form className={styles.stack} style={{ gap: 10 }} onSubmit={save}>
      <PopoverHeader title="Datas" onClose={close} onBack={onBack} />
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
          Data de entrega
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
      {error && (
        <p className={cx(ui.note, ui.danger)} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className={ui.pri}>
        Salvar
      </button>
      {dueAt && (
        <button type="button" className={ui.sec} onClick={remove}>
          Remover
        </button>
      )}
    </form>
  )
}
