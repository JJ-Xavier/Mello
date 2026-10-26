// As listas do quadro, lado a lado, com "Adicionar outra lista" e o arrastar: listas pelo
// cabeçalho (LIS-03) e cards pelo próprio card, com mouse ou teclado (Arrasto.dc.html).
//
// No arraste de card, o lugar onde ele vai cair é calculado aqui (cardDrag.ts), e não pela
// detecção de colisão do dnd-kit: o card de origem continua no lugar, translúcido, e a vaga aparece
// no destino. Com o mouse, o destino segue o ponteiro; com o teclado, as setas andam pelas
// posições.
import {
  closestCenter,
  DndContext,
  DragOverlay,
  type Active,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter
} from '@dnd-kit/core'
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates
} from '@dnd-kit/sortable'
import { useQueryClient } from '@tanstack/react-query'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent
} from 'react'
import type { BoardDetail } from '../../../../shared/ipc/boards'
import type { CardSummary } from '../../../../shared/ipc/cards'
import { isFilterActive, type BoardFilter } from '../../../../shared/rules/filter'
import { LIST_TITLE_MAX } from '../../../../shared/limits'
import { agingOf } from '../../../../shared/rules/aging'
import { doneAfterMove } from '../../../../shared/rules/finished'
import { announcements, screenReaderInstructions, useDragSensors } from '../../components/dnd'
import { Icon } from '../../components/Icon'
import ui from '../../components/ui.module.css'
import { api, unwrap } from '../../lib/api'
import { useAction, useSettings } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import { useNow } from '../../lib/useNow'
import styles from './BoardPage.module.css'
import {
  applyMove,
  edgeStep,
  fullIndex,
  keyboardTarget,
  sameTarget,
  targetFromPoint,
  type CardDrag,
  type Direction,
  type DropTarget,
  type MeasuredList
} from './cardDrag'
import { CardOverlay, ListColumn, ListOverlay } from './ListColumn'

function AddList({ boardId }: { boardId: string }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const run = useAction()

  if (!open) {
    return (
      <button type="button" className={styles.addListButton} onClick={() => setOpen(true)}>
        <Icon name="plus" />
        Adicionar outra lista
      </button>
    )
  }

  // Depois de adicionar, o campo continua aberto para a próxima lista.
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    setTitle('')
    await run(
      () => unwrap(api().lists.create({ boardId, title: trimmed })),
      [queryKeys.board(boardId)]
    )
  }

  return (
    <form className={styles.addListForm} onSubmit={submit}>
      <input
        className={styles.addListInput}
        placeholder="Digite o nome da lista..."
        aria-label="Nome da lista"
        value={title}
        maxLength={LIST_TITLE_MAX}
        autoFocus
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
        }}
      />
      <div className={styles.formRow}>
        <button type="submit" className={ui.pri}>
          Adicionar Lista
        </button>
        <button
          type="button"
          className={styles.cancel}
          aria-label="Cancelar"
          onClick={() => setOpen(false)}
        >
          <Icon name="close" size={20} />
        </button>
      </div>
    </form>
  )
}

type Dragging =
  { type: 'list'; id: string; keyboard: boolean } | ({ type: 'card'; keyboard: boolean } & CardDrag)

const DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right'
}

// Espaço entre os cards e entre as partes da lista (ListColumn.module.css).
const GAP = 8
// Borda (2 px) + espaço interno (8 px) da lista.
const LIST_INSET = 10

const isCard = (active: Active) => active.data.current?.['type'] === 'card'

// Com o filtro do quadro ativo (FLT), a tela e o arraste usam só os cards visíveis; ao soltar, a
// posição é convertida para a lista inteira, com os cards escondidos pelo filtro.
export function ListsArea({
  board: fullBoard,
  filter,
  visible
}: {
  board: BoardDetail
  filter: BoardFilter
  visible: (card: CardSummary) => boolean
}) {
  const filtering = isFilterActive(filter)
  const board = useMemo(
    () =>
      filtering
        ? {
            ...fullBoard,
            lists: fullBoard.lists.map((l) => ({ ...l, cards: l.cards.filter(visible) }))
          }
        : fullBoard,
    [fullBoard, filtering, visible]
  )
  const queryClient = useQueryClient()
  const run = useAction()
  const now = useNow()
  // ENV-03: até as configurações chegarem, vale o padrão (ligado).
  const agingOn = useSettings().data?.['aging.enabled'] ?? true
  const [dragging, setDraggingState] = useState<Dragging | null>(null)
  const [message, setMessage] = useState('')

  // O arraste lê o estado atual fora do ciclo de render (ponteiro e teclado), então ele também
  // fica numa ref.
  const draggingRef = useRef<Dragging | null>(null)
  const boardRef = useRef(board)
  const sections = useRef(new Map<string, HTMLElement>())
  const listsRef = useRef<HTMLDivElement>(null)
  const pointer = useRef({ x: 0, y: 0 })

  useLayoutEffect(() => {
    boardRef.current = board
  }, [board])

  const setDragging = useCallback((next: Dragging | null) => {
    draggingRef.current = next
    setDraggingState(next)
  }, [])

  const registerSection = useCallback((listId: string, element: HTMLElement | null) => {
    if (element) sections.current.set(listId, element)
    else sections.current.delete(listId)
  }, [])

  const describe = useCallback((target: DropTarget) => {
    const list = boardRef.current.lists.find((l) => l.id === target.listId)
    return `${list?.title ?? 'lista'}, posição ${target.index + 1}`
  }, [])

  // Onde as listas e os cards estão na tela agora.
  const measure = useCallback(
    (): MeasuredList[] =>
      boardRef.current.lists.flatMap((list) => {
        const section = sections.current.get(list.id)
        if (!section) return []
        const box = section.getBoundingClientRect()
        const cards = [...section.querySelectorAll<HTMLElement>('[data-card-id]')].map((el) => {
          const rect = el.getBoundingClientRect()
          return { id: el.dataset['cardId'] ?? '', top: rect.top, bottom: rect.bottom }
        })
        return [{ id: list.id, left: box.left, right: box.right, cards }]
      }),
    []
  )

  // Teclado: onde a vaga vai aparecer, para o card que segue o teclado ir para lá. A vaga atual
  // some quando a nova aparece, então os cards abaixo dela sobem.
  const slotPosition = useCallback((current: CardDrag, next: DropTarget) => {
    const section = sections.current.get(next.listId)
    if (!section) return undefined
    const cards = [...section.querySelectorAll<HTMLElement>('[data-card-id]')]
    const others = cards.filter((el) => el.dataset['cardId'] !== current.card.id)
    const anchor = sameTarget(next, current.origin)
      ? cards.find((el) => el.dataset['cardId'] === current.card.id)
      : others[next.index]
    let top: number
    if (anchor) top = anchor.getBoundingClientRect().top
    else if (cards.length > 0) top = cards.at(-1)!.getBoundingClientRect().bottom + GAP
    else top = section.firstElementChild!.getBoundingClientRect().bottom + GAP
    const slot = section.querySelector('[data-slot]')?.getBoundingClientRect()
    if (slot && slot.top < top) top -= slot.height + GAP
    return { x: section.getBoundingClientRect().left + LIST_INSET, y: top }
  }, [])

  const coordinateGetter = useCallback<KeyboardCoordinateGetter>(
    (event, args) => {
      const current = draggingRef.current
      if (current?.type !== 'card') return sortableKeyboardCoordinates(event, args)
      const direction = DIRECTIONS[event.code]
      if (!direction) return undefined
      event.preventDefault()
      const counts = boardRef.current.lists.map((l) => ({
        id: l.id,
        count: l.cards.filter((c) => c.id !== current.card.id).length
      }))
      const next = keyboardTarget(current.target, direction, counts)
      if (sameTarget(next, current.target)) return undefined
      const position = slotPosition(current, next)
      setDragging({ ...current, target: next })
      setMessage(`${describe(next)}.`)
      return position
    },
    [setDragging, slotPosition, describe]
  )
  const sensors = useDragSensors(coordinateGetter)

  // Mouse: a cada quadro, rola perto das bordas (o quadro para os lados e a lista de destino
  // para cima e para baixo) e, no arraste de card, o destino acompanha o ponteiro. A rolagem
  // automática do dnd-kit fica desligada: depois de um arraste cancelado ela rolava o quadro
  // sozinha.
  const pointerDrag = dragging !== null && !dragging.keyboard
  useEffect(() => {
    if (!pointerDrag) return
    let dirty = true
    const tick = () => {
      const current = draggingRef.current
      const lists = listsRef.current
      const { x, y } = pointer.current
      if (current && lists) {
        const box = lists.getBoundingClientRect()
        const dx = y >= box.top && y <= box.bottom ? edgeStep(x, box.left, box.right) : 0
        if (dx) lists.scrollLeft += dx
        if (current.type === 'card') {
          const cards = sections.current
            .get(current.target.listId)
            ?.querySelector<HTMLElement>('[data-cards]')
          const area = cards?.getBoundingClientRect()
          if (cards && area && x >= area.left && x <= area.right) {
            const dy = edgeStep(y, area.top, area.bottom)
            if (dy) cards.scrollTop += dy
          }
          if (dirty) {
            dirty = false
            const next = targetFromPoint(measure(), pointer.current, current.card.id)
            if (next && !sameTarget(next, current.target)) {
              setDragging({ ...current, target: next })
            }
          }
        }
      }
      frame = requestAnimationFrame(tick)
    }
    let frame = requestAnimationFrame(tick)
    const onMove = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY }
      dirty = true
    }
    const onScroll = () => {
      dirty = true
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [pointerDrag, measure, setDragging])

  const onDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    setMessage('')
    const keyboard = activatorEvent instanceof KeyboardEvent
    if (!keyboard && 'clientX' in activatorEvent) {
      const { clientX, clientY } = activatorEvent as MouseEvent
      pointer.current = { x: clientX, y: clientY }
    }
    if (!isCard(active)) {
      setDragging({ type: 'list', id: String(active.id), keyboard })
      return
    }
    const list = board.lists.find((l) => l.cards.some((c) => c.id === active.id))
    if (!list) return
    const card = list.cards.find((c) => c.id === active.id)!
    const origin = { listId: list.id, index: list.cards.indexOf(card) }
    setDragging({
      type: 'card',
      keyboard,
      card,
      origin,
      target: origin,
      height: active.rect.current.initial?.height ?? 64
    })
  }

  // Soltar no mesmo lugar não grava nada (CAR-03; o main também confere). Senão, a tela muda na
  // hora e o main grava; se falhar, o quadro é recarregado do banco.
  const dropCard = (current: CardDrag & { keyboard: boolean }) => {
    const target = current.keyboard
      ? current.target
      : (targetFromPoint(measure(), pointer.current, current.card.id) ?? current.target)
    setDragging(null)
    if (sameTarget(target, current.origin)) {
      setMessage(`${current.card.title} voltou para o mesmo lugar.`)
      return
    }
    setMessage(`${current.card.title} solto em ${describe(target)}.`)
    const all = fullBoard.lists.find((l) => l.id === target.listId)?.cards ?? []
    const shown = board.lists.find((l) => l.id === target.listId)?.cards ?? []
    const saved = { ...target, index: fullIndex(all, shown, current.card.id, target.index) }
    const key = queryKeys.board(board.id)
    const latest = queryClient.getQueryData<BoardDetail>(key) ?? fullBoard
    queryClient.setQueryData<BoardDetail>(key, applyMove(latest, current.card.id, saved, now))
    void run(
      () => unwrap(api().cards.move({ cardId: current.card.id, ...saved })),
      [key, queryKeys.card(current.card.id)]
    )
  }

  const dropList = ({ active: dragged, over }: DragEndEvent) => {
    setDragging(null)
    if (!over || dragged.id === over.id) return
    const from = board.lists.findIndex((l) => l.id === dragged.id)
    const to = board.lists.findIndex((l) => l.id === over.id)
    queryClient.setQueryData<BoardDetail>(queryKeys.board(board.id), {
      ...fullBoard,
      lists: arrayMove(fullBoard.lists, from, to)
    })
    void run(
      () => unwrap(api().lists.move({ listId: String(dragged.id), index: to })),
      [queryKeys.board(board.id)]
    )
  }

  const onDragEnd = (event: DragEndEvent) => {
    const current = draggingRef.current
    if (current?.type === 'card') dropCard(current)
    else dropList(event)
  }

  const cardTitle = (id: unknown) =>
    board.lists.flatMap((l) => l.cards).find((c) => c.id === id)?.title ?? 'card'
  const listName = (id: unknown) => board.lists.find((l) => l.id === id)?.title ?? 'lista'
  const listPosition = (id: unknown) => board.lists.findIndex((l) => l.id === id)
  const forLists = announcements(listName, listPosition)
  // O que o leitor de tela fala. Para os cards, o destino e o soltar vão pela região própria
  // (logo abaixo), porque o destino não vem da colisão do dnd-kit.
  const spoken: Announcements = {
    onDragStart: (e) =>
      isCard(e.active) ? `Pegou ${cardTitle(e.active.id)}.` : forLists.onDragStart(e),
    onDragOver: (e) => (isCard(e.active) ? undefined : forLists.onDragOver(e)),
    onDragEnd: (e) => (isCard(e.active) ? undefined : forLists.onDragEnd(e)),
    onDragCancel: (e) =>
      isCard(e.active)
        ? `Movimento de ${cardTitle(e.active.id)} cancelado.`
        : forLists.onDragCancel(e)
  }

  const cardDrag = dragging?.type === 'card' ? dragging : null
  const activeList =
    dragging?.type === 'list' ? board.lists.find((l) => l.id === dragging.id) : null
  const origin = cardDrag && board.lists.find((l) => l.id === cardDrag.origin.listId)
  const target = cardDrag && board.lists.find((l) => l.id === cardDrag.target.listId)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
      autoScroll={false}
      accessibility={{ screenReaderInstructions, announcements: spoken }}
    >
      <div ref={listsRef} className={styles.lists}>
        <SortableContext
          items={board.lists.map((l) => l.id)}
          strategy={horizontalListSortingStrategy}
        >
          {board.lists.map((list) => (
            <ListColumn
              key={list.id}
              list={list}
              board={board}
              drag={cardDrag}
              now={now}
              agingOn={agingOn}
              filtering={filtering}
              registerSection={registerSection}
            />
          ))}
        </SortableContext>
        <AddList boardId={board.id} />
      </div>
      <div className="visually-hidden" aria-live="assertive">
        {message}
      </div>
      <DragOverlay>
        {activeList && (
          <ListOverlay
            list={activeList}
            board={board}
            now={now}
            agingOn={agingOn}
            filtering={filtering}
          />
        )}
        {cardDrag && origin && target && (
          <CardOverlay
            card={{ ...cardDrag.card, isDone: doneAfterMove(cardDrag.card.isDone, origin, target) }}
            list={target}
            now={now}
            aging={agingOf(cardDrag.card, origin, agingOn, now)}
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}
