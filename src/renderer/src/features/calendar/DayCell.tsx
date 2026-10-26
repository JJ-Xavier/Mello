// Um dia do calendário: o número (hoje no círculo azul, CAL-04), os itens que cabem e o "+N mais",
// que abre a lista completa do dia (CAL-13), e o "Adicionar" ao passar o mouse (CAL-12). Dias de
// fora do mês ficam mais escuros e sem itens (CAL-03).
import { useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { CARD_TITLE_MAX } from '../../../../shared/limits'
import { addTarget, visibleCount, type CalendarDay } from '../../../../shared/rules/calendar'
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

const GAP = 4
const MORE_HEIGHT = 24

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
  const box = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState({ shown: items.length, moreTop: 0 })
  const [adding, setAdding] = useState(false)
  const addId = useId()
  const moreId = useId()
  const label = formatDayLong(day.day)

  // CAL-13: mede onde cada item termina e mostra os que cabem; os outros continuam no lugar,
  // invisíveis, para a próxima medida (a célula muda de altura com a janela).
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    const measure = () => {
      const children = [...element.querySelectorAll<HTMLElement>(':scope > [data-item]')]
      const bottoms = children.map((child) => child.offsetTop + child.offsetHeight)
      const shown = visibleCount(bottoms, element.clientHeight, GAP, MORE_HEIGHT)
      const moreTop = shown === 0 ? 0 : bottoms[shown - 1]! + GAP
      setFit((current) =>
        current.shown === shown && current.moreTop === moreTop ? current : { shown, moreTop }
      )
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [items])

  const hiddenCount = items.length - fit.shown

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
          <div ref={box} className={styles.items}>
            {items.map((item, index) => (
              <div
                key={item.id}
                data-item=""
                className={cx(styles.slot, index >= fit.shown && styles.hidden)}
                inert={index >= fit.shown}
                aria-hidden={index >= fit.shown || undefined}
              >
                <CalendarItem item={item} {...options} />
              </div>
            ))}
            {hiddenCount > 0 && (
              <button
                type="button"
                className={styles.more}
                style={{ top: fit.moreTop }}
                popoverTarget={moreId}
              >
                +{hiddenCount} mais
              </button>
            )}
          </div>
          <Popover id={moreId} label={`Itens de ${label}`} width={300}>
            {(close) => (
              <>
                <PopoverHeader title={label} onClose={close} />
                <div className={styles.dayList}>
                  {items.map((item) => (
                    <CalendarItem key={item.id} item={item} {...options} />
                  ))}
                </div>
              </>
            )}
          </Popover>
          {/* Num dia cheio, o "Adicionar" vira só o "+" à direita, para não cobrir o "+N mais". */}
          <button
            type="button"
            className={cx(
              styles.add,
              hiddenCount > 0 && styles.addCompact,
              adding && styles.addOpen
            )}
            title={hiddenCount > 0 ? 'Adicionar' : undefined}
            popoverTarget={addId}
          >
            <Icon name="plus" />
            <span className={hiddenCount > 0 ? 'visually-hidden' : undefined}>Adicionar</span>
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
