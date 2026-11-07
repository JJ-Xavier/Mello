// Um dia do calendário: o número (hoje no círculo azul, CAL-04), todos os itens (o dia cresce até
// caber, CAL-13) e o "+" do "Adicionar" na linha do número, ao passar o mouse (CAL-12). Dias de
// fora do mês ficam mais escuros e sem itens (CAL-03).
import { useId, useState, type FormEvent } from 'react'
import { CARD_TITLE_MAX } from '../../../../shared/limits'
import { addTarget, type CalendarDay } from '../../../../shared/rules/calendar'
import { dueDate } from '../../../../shared/rules/dates'
import { Icon } from '../../components/Icon'
import { Popover, PopoverHeader } from '../../components/Popover'
import ui from '../../components/ui.module.css'
import { api, unwrap } from '../../lib/api'
import { cx } from '../../lib/cx'
import { formatDayLong, formatShortDate } from '../../lib/format'
import { useAction, useBoard, useBoards } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import formStyles from '../card/CreateCardForm.module.css'
import styles from './Calendar.module.css'
import { CalendarItem, type DayItem, type ItemOptions } from './CalendarItems'

// O card novo entra na primeira lista do quadro que não é de conclusão, com a data do dia e sem
// hora. No calendário de todos os quadros, o formulário pergunta o quadro (começa no escolhido).
function AddToDay({
  day,
  boardId: fixedBoard,
  preferredBoardId,
  close
}: {
  day: string
  boardId: string | null
  preferredBoardId: string | null
  close: () => void
}) {
  const boards = useBoards()
  const [chosen, setChosen] = useState('')
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const run = useAction()

  const open = boards.data ?? []
  const boardId =
    fixedBoard ??
    [chosen, preferredBoardId].find((id) => id && open.some((b) => b.id === id)) ??
    open[0]?.id ??
    ''
  const board = useBoard(boardId)
  const target = board.data ? addTarget(board.data.lists) : null

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || !target || saving) return
    setSaving(true)
    const created = await run(
      () => unwrap(api().calendar.addCard({ boardId, day, title: trimmed })),
      [queryKeys.board(boardId)]
    )
    setSaving(false)
    if (created) close()
  }

  return (
    <form className={formStyles.form} onSubmit={submit}>
      <PopoverHeader
        title={`Adicionar em ${formatShortDate(dueDate(day).getTime())}`}
        onClose={close}
      />
      {fixedBoard === null && boards.data && open.length === 0 ? (
        <p className={ui.note}>Crie um quadro primeiro: o card precisa de um quadro e uma lista.</p>
      ) : (
        <>
          {fixedBoard === null && (
            <label className={ui.label}>
              Quadro
              <select
                className={ui.fld}
                value={boardId}
                onChange={(event) => setChosen(event.target.value)}
              >
                {open.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className={ui.label}>
            Título do card
            <textarea
              className={`${ui.fld} ${formStyles.title}`}
              value={title}
              maxLength={CARD_TITLE_MAX}
              placeholder="Insira um título para este cartão..."
              autoFocus
              onChange={(event) => setTitle(event.target.value.replace(/\s*\n\s*/g, ' '))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void submit()
                }
              }}
            />
          </label>
          {board.data && (
            <p className={ui.note}>
              {target
                ? `Entra na lista “${target.title}”, com entrega neste dia.`
                : 'Este quadro não tem uma lista que não seja de conclusão.'}
            </p>
          )}
          <button
            type="submit"
            className={`${ui.pri} ${formStyles.submit}`}
            disabled={!title.trim() || !target || saving}
          >
            Adicionar cartão
          </button>
        </>
      )}
    </form>
  )
}

interface DayCellProps {
  day: CalendarDay
  today: boolean
  items: DayItem[]
  options: ItemOptions
  // O quadro do calendário do quadro, ou null no de todos os quadros (o "Adicionar" pergunta).
  boardId: string | null
  // No de todos os quadros, o quadro escolhido no seletor (o "Adicionar" começa nele).
  preferredBoardId: string | null
}

export function DayCell({ day, today, items, options, boardId, preferredBoardId }: DayCellProps) {
  const [adding, setAdding] = useState(false)
  const addId = useId()
  const label = formatDayLong(day.day)

  return (
    <div
      role="group"
      aria-label={label}
      aria-current={today ? 'date' : undefined}
      className={cx(styles.day, !day.inMonth && styles.outside, today && styles.today)}
    >
      <div className={styles.num}>
        <span aria-hidden="true">{Number(day.day.slice(8))}</span>
      </div>
      {day.inMonth && (
        <>
          {items.map((item) => (
            <CalendarItem key={item.id} item={item} {...options} />
          ))}
          <button
            type="button"
            className={cx(styles.add, adding && styles.addOpen)}
            title="Adicionar"
            popoverTarget={addId}
          >
            <Icon name="plus" />
            <span className="visually-hidden">Adicionar</span>
          </button>
          <Popover id={addId} label={`Adicionar card em ${label}`} onToggle={setAdding}>
            {(close) => (
              <AddToDay
                day={day.day}
                boardId={boardId}
                preferredBoardId={preferredBoardId}
                close={close}
              />
            )}
          </Popover>
        </>
      )}
    </div>
  )
}
