// Calendário mensal (CAL-01). Aberto pela barra de baixo do quadro, mostra aquele quadro
// (Calendario.dc.html); pelo menu lateral do Início, todos os quadros, com o seletor de quadro
// (NovoCalendarioTodos.dc.html), CAL-02. Abre no mês atual; o mês, os filtros e o quadro escolhido
// não ficam salvos.
import { useId, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import type { BoardSummary } from '../../../../shared/ipc/boards'
import type { CalendarMonth } from '../../../../shared/ipc/calendar'
import type { Settings } from '../../../../shared/ipc/settings'
import {
  calendarWeeks,
  shiftMonth,
  sortDayCards,
  sortDayTasks
} from '../../../../shared/rules/calendar'
import { dayOf } from '../../../../shared/rules/dates'
import { BoardThumb } from '../../components/BoardThumb'
import { Icon } from '../../components/Icon'
import { Popover, PopoverHeader } from '../../components/Popover'
import ui from '../../components/ui.module.css'
import { clockNow } from '../../lib/clock'
import { cx } from '../../lib/cx'
import { formatMonth, formatMonthShort, MONTH_NAMES, weekdayNames } from '../../lib/format'
import { useBoard, useBoards, useCalendar, useSettings } from '../../lib/queries'
import { useNow } from '../../lib/useNow'
import { ChangeBackground } from '../background/ChangeBackground'
import boardStyles from '../board/BoardPage.module.css'
import { ClosedBoardNotice } from '../board/ClosedBoardNotice'
import styles from './Calendar.module.css'
import type { DayItem } from './CalendarItems'
import { DayCell } from './DayCell'

interface MonthView {
  year: number
  month: number
}

// Dia sem itens. Uma lista só, para o dia não medir de novo a cada renderização (CAL-13).
const NO_ITEMS: DayItem[] = []

function currentMonth(now = clockNow()): MonthView {
  const date = new Date(now)
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}

// Os itens de cada dia, já filtrados (CAL-09) e em ordem: cards antes das tarefas (CAL-10).
function itemsByDay(
  data: CalendarMonth | undefined,
  showCards: boolean,
  showTasks: boolean
): Map<string, DayItem[]> {
  const byDay = new Map<string, DayItem[]>()
  if (!data) return byDay
  const cardsOf = new Map<string, CalendarMonth['cards']>()
  const tasksOf = new Map<string, CalendarMonth['tasks']>()
  const repeatsOf = new Map<string, CalendarMonth['repeats']>()
  if (showCards) {
    for (const card of data.cards) {
      const day = card.dueAt.slice(0, 10)
      cardsOf.set(day, [...(cardsOf.get(day) ?? []), card])
    }
    for (const repeat of data.repeats) {
      const day = repeat.occurrence.slice(0, 10)
      repeatsOf.set(day, [...(repeatsOf.get(day) ?? []), repeat])
    }
  }
  if (showTasks) {
    for (const task of data.tasks) {
      const day = task.dueDate.slice(0, 10)
      tasksOf.set(day, [...(tasksOf.get(day) ?? []), task])
    }
  }
  for (const day of new Set([...cardsOf.keys(), ...repeatsOf.keys(), ...tasksOf.keys()])) {
    byDay.set(day, [
      ...sortDayCards(cardsOf.get(day) ?? []).map((card) => ({
        kind: 'card' as const,
        id: `card-${card.id}`,
        card
      })),
      // REP-14: as repetições que não viraram card vêm depois dos cards de verdade.
      ...(repeatsOf.get(day) ?? []).map((repeat) => ({
        kind: 'repeat' as const,
        id: repeat.id,
        repeat
      })),
      ...sortDayTasks(tasksOf.get(day) ?? []).map((task) => ({
        kind: 'task' as const,
        id: `task-${task.id}`,
        task
      }))
    ])
  }
  return byDay
}

function MonthPicker({
  view,
  onPick,
  close
}: {
  view: MonthView
  onPick: (view: MonthView) => void
  close: () => void
}) {
  const [year, setYear] = useState(view.year)
  return (
    <>
      <PopoverHeader title="Escolher mês" onClose={close} />
      <div className={styles.yearRow}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Ano anterior"
          onClick={() => setYear(year - 1)}
        >
          <Icon name="chevronLeft" />
        </button>
        {year}
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Próximo ano"
          onClick={() => setYear(year + 1)}
        >
          <Icon name="chevronRight" />
        </button>
      </div>
      <div className={styles.months}>
        {MONTH_NAMES.map((name, index) => (
          <button
            key={name}
            type="button"
            className={styles.monthOption}
            aria-label={formatMonth(year, index + 1)}
            aria-pressed={year === view.year && index + 1 === view.month}
            onClick={() => {
              onPick({ year, month: index + 1 })
              close()
            }}
          >
            {name}
          </button>
        ))}
      </div>
    </>
  )
}

// "Quadros no calendário" (NovoCalendarioTodos.dc.html): todos ou um quadro.
function ScopePicker({
  boards,
  current,
  onPick,
  close
}: {
  boards: BoardSummary[]
  current: string | null
  onPick: (boardId: string | null) => void
  close: () => void
}) {
  const pick = (boardId: string | null) => {
    onPick(boardId)
    close()
  }
  return (
    <>
      <button
        type="button"
        className={cx(ui.mi, styles.scopeAll)}
        aria-pressed={current === null}
        onClick={() => pick(null)}
      >
        <span className={styles.mark}>{current === null && <Icon name="check" />}</span>
        Todos os quadros
      </button>
      <div className={ui.sep} />
      {boards.map((board) => (
        <button
          key={board.id}
          type="button"
          className={ui.mi}
          aria-pressed={current === board.id}
          onClick={() => pick(board.id)}
        >
          <span className={styles.mark}>{current === board.id && <Icon name="check" />}</span>
          <BoardThumb background={board.background} width={32} height={22} />
          <span className={styles.scopeName}>{board.title}</span>
        </button>
      ))}
    </>
  )
}

interface MonthGridProps {
  settings: Settings
  // O quadro mostrado, ou null para todos os quadros.
  boardId: string | null
  allBoards: boolean
  // O seletor de quadro (todos os quadros) ou o X de fechar (calendário do quadro).
  scope?: ReactNode
  close?: ReactNode
  scopeLabel?: string
}

function MonthGrid({ settings, boardId, allBoards, scope, close, scopeLabel }: MonthGridProps) {
  const now = useNow()
  const monthId = useId()
  const [view, setView] = useState(() => currentMonth())
  const [showCards, setShowCards] = useState(true)
  // CAL-09: o valor inicial de "Tarefas" vem das Configurações.
  const [showTasks, setShowTasks] = useState(settings['calendar.showTasks'])
  const { data } = useCalendar(boardId, view.year, view.month)
  const weekStart = settings['calendar.weekStart']
  const weeks = useMemo(
    () => calendarWeeks(view.year, view.month, weekStart),
    [view.year, view.month, weekStart]
  )
  const byDay = useMemo(() => itemsByDay(data, showCards, showTasks), [data, showCards, showTasks])
  const strike = settings['calendar.strikeDone']
  const today = dayOf(now)
  const options = { now, strike, allBoards }

  return (
    <section
      aria-label={`Calendário de ${formatMonth(view.year, view.month)}${scopeLabel ? `, ${scopeLabel}` : ''}`}
      className={cx(styles.section, !allBoards && styles.boardSection)}
    >
      <div className={styles.toolbar}>
        <button
          type="button"
          className={cx(styles.tb, styles.monthButton)}
          popoverTarget={monthId}
          aria-label={`Escolher mês: ${formatMonth(view.year, view.month)}`}
        >
          {formatMonthShort(view.year, view.month)}
          <Icon name="chevronDown" />
        </button>
        <Popover id={monthId} label="Escolher mês" width={280}>
          {(closeMonth) => <MonthPicker view={view} onPick={setView} close={closeMonth} />}
        </Popover>
        <div className={styles.navGroup}>
          <button
            type="button"
            className={styles.tb}
            aria-label="Mês anterior"
            onClick={() => setView(shiftMonth(view.year, view.month, -1))}
          >
            <Icon name="chevronLeft" />
          </button>
          <button type="button" className={styles.tb} onClick={() => setView(currentMonth())}>
            Hoje
          </button>
          <button
            type="button"
            className={styles.tb}
            aria-label="Próximo mês"
            onClick={() => setView(shiftMonth(view.year, view.month, 1))}
          >
            <Icon name="chevronRight" />
          </button>
        </div>
        {scope}
        <div
          role="group"
          aria-label="Mostrar no calendário"
          className={cx(styles.filters, scope !== undefined && styles.filtersAfterScope)}
        >
          <button
            type="button"
            className={styles.tb}
            aria-pressed={showCards}
            onClick={() => setShowCards(!showCards)}
          >
            <span className={styles.cardsSwatch} />
            Cards
          </button>
          <button
            type="button"
            className={styles.tb}
            aria-pressed={showTasks}
            onClick={() => setShowTasks(!showTasks)}
          >
            <Icon name="square" size={14} />
            Tarefas do checklist
          </button>
        </div>
        <div className={styles.spacer} />
        {strike && <span className={styles.legend}>Riscado = finalizado</span>}
        {close}
      </div>
      <div className={styles.weekdays} aria-hidden="true">
        {weekdayNames(weekStart).map((name) => (
          <div key={name} className={styles.weekday}>
            {name}
          </div>
        ))}
      </div>
      <div
        className={styles.grid}
        style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}
      >
        {weeks.flat().map((day) => (
          <DayCell
            key={day.day}
            day={day}
            today={day.day === today}
            items={day.inMonth ? (byDay.get(day.day) ?? NO_ITEMS) : NO_ITEMS}
            options={options}
            boardId={allBoards ? null : boardId}
            preferredBoardId={boardId}
          />
        ))}
      </div>
    </section>
  )
}

// O calendário só aparece com as Configurações carregadas: o início da semana e o filtro de
// tarefas dependem delas.
function MonthWithSettings(props: Omit<MonthGridProps, 'settings'>) {
  const { data: settings } = useSettings()
  if (!settings) return null
  return <MonthGrid settings={settings} {...props} />
}

// Calendário do quadro (tela 5): a barra do quadro em cima, o calendário e a barra flutuante
// (BoardLayout) embaixo.
function BoardCalendar() {
  const { boardId = '' } = useParams()
  const { data: board } = useBoard(boardId)
  if (!board) return null
  if (board.closedAt !== null) return <ClosedBoardNotice board={board} />
  return (
    <div className={boardStyles.page}>
      <div className={boardStyles.bar}>
        <h1 className={styles.barTitle}>{board.title}</h1>
        <div className={boardStyles.spacer} />
        <ChangeBackground boardId={board.id} />
      </div>
      <MonthWithSettings
        boardId={board.id}
        allBoards={false}
        close={
          <Link to={`/boards/${board.id}`} className={styles.close} aria-label="Fechar calendário">
            <Icon name="close" size={20} />
          </Link>
        }
      />
    </div>
  )
}

// Calendário de todos os quadros (tela 13), dentro do Início.
function AllCalendar() {
  const scopeId = useId()
  const { data: boards = [] } = useBoards()
  const [chosen, setChosen] = useState<string | null>(null)
  // Um quadro escolhido que foi fechado ou excluído volta para "Todos os quadros".
  const current = boards.find((b) => b.id === chosen) ?? null
  const label = current ? current.title : 'Todos os quadros'
  return (
    <div className={styles.allPage}>
      <MonthWithSettings
        boardId={current?.id ?? null}
        allBoards
        scopeLabel={current ? current.title : 'todos os quadros'}
        scope={
          <>
            <button
              type="button"
              className={cx(styles.tb, styles.scopeButton)}
              popoverTarget={scopeId}
              aria-label={`Quadros no calendário: ${label}`}
            >
              <Icon name="board" />
              <span className={styles.scopeName}>{label}</span>
              <Icon name="chevronDown" />
            </button>
            <Popover id={scopeId} label="Quadros no calendário" width={280}>
              {(close) => (
                <ScopePicker
                  boards={boards}
                  current={current?.id ?? null}
                  onPick={setChosen}
                  close={close}
                />
              )}
            </Popover>
          </>
        }
      />
    </div>
  )
}

export function CalendarPage({ scope }: { scope: 'all' | 'board' }) {
  return scope === 'all' ? <AllCalendar /> : <BoardCalendar />
}
