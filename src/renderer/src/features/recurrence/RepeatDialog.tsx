// Diálogo "Repetir card" (Repeticao.dc.html): frequência, dias, horário, lista de destino, o que
// copiar, o que fazer se o anterior não estiver concluído, término, "Próximas:", Salvar e "Remover
// repetição". Nada é salvo antes de "Salvar". A prévia usa as mesmas contas do agendador
// (shared/rules/recurrence.ts), a partir de agora.
import { useState, type FormEvent } from 'react'
import type { CardDetail } from '../../../../shared/ipc/cards'
import type { RecurrenceRuleInput } from '../../../../shared/ipc/recurrence'
import {
  dayOf,
  formatDayInput,
  parseDayInput,
  parseTimeInput
} from '../../../../shared/rules/dates'
import {
  nextOccurrences,
  previewDayText,
  stampOf,
  type EndsKind,
  type Frequency
} from '../../../../shared/rules/recurrence'
import { PopoverHeader } from '../../components/Popover'
import ui from '../../components/ui.module.css'
import { api, unwrap } from '../../lib/api'
import { clockNow } from '../../lib/clock'
import { cx } from '../../lib/cx'
import { useBoard } from '../../lib/queries'
import { useCardAction } from '../card/useCardAction'
import styles from './Recurrence.module.css'

const FREQUENCY_TABS: { value: Frequency; label: string }[] = [
  { value: 'daily', label: 'Diária' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'every_n', label: 'A cada N' }
]

// Domingo a sábado, na ordem da máscara (dom = 1 … sáb = 64).
const WEEKDAYS = [
  ['D', 'domingo'],
  ['S', 'segunda'],
  ['T', 'terça'],
  ['Q', 'quarta'],
  ['Q', 'quinta'],
  ['S', 'sexta'],
  ['S', 'sábado']
] as const

const toInt = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN)

export function RepeatDialog({ card, close }: { card: CardDetail; close: () => void }) {
  const { data: board } = useBoard(card.boardId)
  const act = useCardAction(card)
  const saved = card.recurrence
  const today = new Date(clockNow())

  const [freq, setFreq] = useState<Frequency>(saved?.freq ?? 'weekly')
  const [weekdays, setWeekdays] = useState(
    saved && saved.weekdays > 0 ? saved.weekdays : 1 << today.getDay()
  )
  const [monthDay, setMonthDay] = useState(String(saved?.monthDay ?? today.getDate()))
  const [intervalText, setIntervalText] = useState(String(saved?.intervalDays ?? 3))
  const [timeText, setTimeText] = useState(saved?.time ?? '08:00')
  const [targetListId, setTargetListId] = useState(saved?.targetListId ?? card.listId)
  const [copy, setCopy] = useState({
    labelsPriority: saved?.copyLabelsPriority ?? true,
    description: saved?.copyDescription ?? true,
    checklist: saved?.copyChecklist ?? true,
    dueDate: saved?.copyDueDate ?? false
  })
  const [ifOpen, setIfOpen] = useState(saved?.ifPreviousOpen ?? 'skip')
  const [endsKind, setEndsKind] = useState<EndsKind>(saved?.endsKind ?? 'never')
  const [endsOnText, setEndsOnText] = useState(
    formatDayInput(saved?.endsOn ?? `${today.getFullYear()}-12-31`)
  )
  const [endsAfterText, setEndsAfterText] = useState(String(saved?.endsAfter ?? 10))
  const [error, setError] = useState('')

  const lists = board?.lists ?? []
  const target = lists.some((l) => l.id === targetListId) ? targetListId : (lists[0]?.id ?? '')

  // A regra como está no formulário, ou o motivo de ainda não valer.
  const build = (): RecurrenceRuleInput | string => {
    const time = parseTimeInput(timeText)
    if (!time) return 'Horário inválido. Use hh:mm.'
    if (freq === 'weekly' && weekdays === 0) return 'Escolha pelo menos um dia da semana.'
    const day = toInt(monthDay)
    if (freq === 'monthly' && !(day >= 1 && day <= 31)) return 'O dia do mês vai de 1 a 31.'
    const n = toInt(intervalText)
    if (freq === 'every_n' && !(n >= 1 && n <= 365)) return 'N vai de 1 a 365 dias.'
    const endsOn = parseDayInput(endsOnText)
    if (endsKind === 'on_date' && !endsOn) return 'Data final inválida. Use dd/mm/aaaa.'
    const count = toInt(endsAfterText)
    if (endsKind === 'after_count' && !(count >= 1 && count <= 999)) {
      return 'O número de vezes vai de 1 a 999.'
    }
    if (!target) return 'Escolha a lista.'
    return {
      freq,
      weekdays: freq === 'weekly' ? weekdays : 0,
      monthDay: freq === 'monthly' ? day : null,
      intervalDays: freq === 'every_n' ? n : null,
      time,
      targetListId: target,
      copyLabelsPriority: copy.labelsPriority,
      copyDescription: copy.description,
      copyChecklist: copy.checklist,
      copyDueDate: copy.dueDate,
      ifPreviousOpen: ifOpen,
      endsKind,
      endsOn: endsKind === 'on_date' ? endsOn : null,
      endsAfter: endsKind === 'after_count' ? count : null
    }
  }

  const rule = build()
  const now = clockNow()
  const preview =
    typeof rule === 'string'
      ? []
      : nextOccurrences({ ...rule, anchorDate: dayOf(now) }, 0, stampOf(now), 3)

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (typeof rule === 'string') return setError(rule)
    close()
    void act(() => unwrap(api().recurrence.save({ cardId: card.id, rule })))
  }

  const remove = () => {
    close()
    void act(() => unwrap(api().recurrence.remove({ cardId: card.id })))
  }

  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value)
      setError('')
    }

  return (
    <form className={styles.dialog} onSubmit={save}>
      <PopoverHeader title="Repetir card" onClose={close} />

      <div className={styles.group}>
        <p className={ui.cap}>FREQUÊNCIA</p>
        <div role="tablist" aria-label="Frequência" className={styles.tabs}>
          {FREQUENCY_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={freq === tab.value}
              className={styles.tab}
              onClick={() => edit(setFreq)(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {freq === 'weekly' && (
          <div role="group" aria-label="Dias da semana" className={styles.weekdays}>
            {WEEKDAYS.map(([short, full], i) => {
              const on = (weekdays & (1 << i)) !== 0
              return (
                <button
                  key={full}
                  type="button"
                  className={styles.weekday}
                  aria-label={full}
                  aria-pressed={on}
                  onClick={() => edit(setWeekdays)(on ? weekdays & ~(1 << i) : weekdays | (1 << i))}
                >
                  {short}
                </button>
              )
            })}
          </div>
        )}
        {freq === 'monthly' && (
          <label className={styles.option}>
            Todo dia
            <input
              className={cx(ui.fld, styles.small)}
              aria-label="Dia do mês"
              inputMode="numeric"
              value={monthDay}
              onChange={(event) => edit(setMonthDay)(event.target.value)}
            />
            do mês
          </label>
        )}
        {freq === 'every_n' && (
          <label className={styles.option}>
            A cada
            <input
              className={cx(ui.fld, styles.small)}
              aria-label="Número de dias"
              inputMode="numeric"
              value={intervalText}
              onChange={(event) => edit(setIntervalText)(event.target.value)}
            />
            dias
          </label>
        )}
      </div>

      <div className={styles.row}>
        <label className={cx(ui.label, styles.grow)}>
          Horário
          <input
            className={ui.fld}
            value={timeText}
            placeholder="hh:mm"
            onChange={(event) => edit(setTimeText)(event.target.value)}
          />
        </label>
        <label className={cx(ui.label, styles.grow)}>
          Criar na lista
          <select
            className={ui.fld}
            value={target}
            onChange={(event) => edit(setTargetListId)(event.target.value)}
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.group}>
        <p className={ui.cap}>COPIAR PARA O NOVO CARD</p>
        {(
          [
            ['labelsPriority', 'Etiquetas e prioridade'],
            ['description', 'Descrição'],
            ['checklist', 'Checklist (todo desmarcado)'],
            ['dueDate', 'Data de entrega (no mesmo dia da repetição)']
          ] as const
        ).map(([key, text]) => (
          <label key={key} className={styles.option}>
            <input
              type="checkbox"
              className={ui.check}
              checked={copy[key]}
              onChange={(event) => setCopy({ ...copy, [key]: event.target.checked })}
            />
            {text}
          </label>
        ))}
      </div>

      <div className={styles.group}>
        <p className={ui.cap}>SE O ANTERIOR NÃO ESTIVER CONCLUÍDO</p>
        <label className={styles.option}>
          <input
            type="radio"
            name="anterior"
            className={ui.check}
            checked={ifOpen === 'skip'}
            onChange={() => setIfOpen('skip')}
          />
          Pular e avisar no card
        </label>
        <label className={styles.option}>
          <input
            type="radio"
            name="anterior"
            className={ui.check}
            checked={ifOpen === 'create'}
            onChange={() => setIfOpen('create')}
          />
          Criar mesmo assim
        </label>
      </div>

      <div className={styles.group}>
        <p className={ui.cap}>TERMINA</p>
        <label className={styles.option}>
          <input
            type="radio"
            name="fim"
            className={ui.check}
            checked={endsKind === 'never'}
            onChange={() => edit(setEndsKind)('never')}
          />
          Nunca
        </label>
        <label className={styles.option}>
          <input
            type="radio"
            name="fim"
            className={ui.check}
            checked={endsKind === 'on_date'}
            onChange={() => edit(setEndsKind)('on_date')}
          />
          Em
          <input
            className={cx(ui.fld, styles.date)}
            aria-label="Data final"
            placeholder="dd/mm/aaaa"
            value={endsOnText}
            onFocus={() => edit(setEndsKind)('on_date')}
            onChange={(event) => {
              edit(setEndsOnText)(event.target.value)
              setEndsKind('on_date')
            }}
          />
        </label>
        <label className={styles.option}>
          <input
            type="radio"
            name="fim"
            className={ui.check}
            checked={endsKind === 'after_count'}
            onChange={() => edit(setEndsKind)('after_count')}
          />
          Depois de
          <input
            className={cx(ui.fld, styles.count)}
            aria-label="Número de repetições"
            inputMode="numeric"
            value={endsAfterText}
            onFocus={() => edit(setEndsKind)('after_count')}
            onChange={(event) => {
              edit(setEndsAfterText)(event.target.value)
              setEndsKind('after_count')
            }}
          />
          vezes
        </label>
      </div>

      <div className={styles.footer}>
        <span className={styles.preview}>
          Próximas: {preview.length > 0 ? preview.map(previewDayText).join(', ') : '—'}
        </span>
        {error && (
          <p className={cx(ui.note, ui.danger)} role="alert">
            {error}
          </p>
        )}
        <div className={styles.row}>
          <button type="submit" className={cx(ui.pri, styles.grow)}>
            Salvar
          </button>
          {saved && (
            <button type="button" className={ui.sec} onClick={remove}>
              Remover repetição
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
