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
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import type { BoardDetail } from '../../../../shared/ipc/boards'
import { LIST_TITLE_MAX } from '../../../../shared/limits'
import { doneAfterMove } from '../../../../shared/rules/finished'
import { announcements, screenReaderInstructions, useDragSensors } from '../../components/dnd'
import { Icon } from '../../components/Icon'
import ui from '../../components/ui.module.css'
import { api, unwrap } from '../../lib/api'
import { useAction } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import { useNow } from '../../lib/useNow'
import styles from './BoardPage.module.css'
import {
  applyMove,
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

type Dragging = { type: 'list'; id: string } | ({ type: 'card'; keyboard: boolean } & CardDrag)

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

export function ListsArea({ board }: { board: BoardDetail }) {
  const queryClient = useQueryClient()
  const run = useAction()
  const now = useNow()
  const [dragging, setDraggingState] = useState<Dragging | null>(null)
  const [message, setMessage] = useState('')

  // O arraste lê o estado atual fora do ciclo de render (ponteiro e teclado), então ele também
  // fica numa ref.
  const draggingRef = useRef<Dragging | null>(null)
  const boardRef = useRef(board)
  const sections = useRef(new Map<string, HTMLElement>())
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

  // Mouse: o destino acompanha o ponteiro (e a rolagem automática do quadro e das listas).
  const pointerDrag = dragging?.type === 'card' && !dragging.keyboard
  useEffect(() => {
    if (!pointerDrag) return
    let frame = 0
    const update = () => {
      frame = 0
      const current = draggingRef.current
      if (current?.type !== 'card') return
      const next = targetFromPoint(measure(), pointer.current, current.card.id)
      if (next && !sameTarget(next, current.target)) setDragging({ ...current, target: next })
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    const onMove = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY }
      schedule()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('scroll', schedule, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('scroll', schedule, true)
    }
  }, [pointerDrag, measure, setDragging])

  const onDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    setMessage('')
    if (!isCard(active)) {
      setDragging({ type: 'list', id: String(active.id) })
      return
    }
    const list = board.lists.find((l) => l.cards.some((c) => c.id === active.id))
    if (!list) return
    const card = list.cards.find((c) => c.id === active.id)!
    const origin = { listId: list.id, index: list.cards.indexOf(card) }
    const keyboard = activatorEvent instanceof KeyboardEvent
    if (!keyboard && 'clientX' in activatorEvent) {
      const { clientX, clientY } = activatorEvent as MouseEvent
      pointer.current = { x: clientX, y: clientY }
    }
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
    const key = queryKeys.board(board.id)
    const latest = queryClient.getQueryData<BoardDetail>(key) ?? board
    queryClient.setQueryData<BoardDetail>(key, applyMove(latest, current.card.id, target))
    void run(
      () => unwrap(api().cards.move({ cardId: current.card.id, ...target })),
      [key, queryKeys.card(current.card.id)]
    )
  }

  const dropList = ({ active: dragged, over }: DragEndEvent) => {
    setDragging(null)
    if (!over || dragged.id === over.id) return
    const from = board.lists.findIndex((l) => l.id === dragged.id)
    const to = board.lists.findIndex((l) => l.id === over.id)
    queryClient.setQueryData<BoardDetail>(queryKeys.board(board.id), {
      ...board,
      lists: arrayMove(board.lists, from, to)
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
      accessibility={{ screenReaderInstructions, announcements: spoken }}
    >
      <div className={styles.lists}>
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
        {activeList && <ListOverlay list={activeList} board={board} now={now} />}
        {cardDrag && origin && target && (
          <CardOverlay
            card={{ ...cardDrag.card, isDone: doneAfterMove(cardDrag.card.isDone, origin, target) }}
            list={target}
            now={now}
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}
