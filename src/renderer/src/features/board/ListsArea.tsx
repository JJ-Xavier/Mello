// As listas do quadro, lado a lado, com arrastar (LIS-03) e "Adicionar outra lista".
import {
  closestCenter,
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { arrayMove, horizontalListSortingStrategy, SortableContext } from '@dnd-kit/sortable'
import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import type { BoardDetail } from '../../../../shared/ipc/boards'
import { LIST_TITLE_MAX } from '../../../../shared/limits'
import { announcements, screenReaderInstructions, useDragSensors } from '../../components/dnd'
import { Icon } from '../../components/Icon'
import ui from '../../components/ui.module.css'
import { api, unwrap } from '../../lib/api'
import { useAction } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import styles from './BoardPage.module.css'
import { ListColumn, ListOverlay } from './ListColumn'

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

export function ListsArea({ board }: { board: BoardDetail }) {
  const sensors = useDragSensors()
  const queryClient = useQueryClient()
  const run = useAction()
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = board.lists.find((l) => l.id === activeId)

  const onDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id))

  // Soltar no mesmo lugar não grava nada (o main também confere).
  const onDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    setActiveId(null)
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

  const nameOf = (id: unknown) => board.lists.find((l) => l.id === id)?.title ?? 'lista'
  const positionOf = (id: unknown) => board.lists.findIndex((l) => l.id === id)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{ screenReaderInstructions, announcements: announcements(nameOf, positionOf) }}
    >
      <div className={styles.lists}>
        <SortableContext
          items={board.lists.map((l) => l.id)}
          strategy={horizontalListSortingStrategy}
        >
          {board.lists.map((list) => (
            <ListColumn key={list.id} list={list} board={board} />
          ))}
        </SortableContext>
        <AddList boardId={board.id} />
      </div>
      <DragOverlay>{active && <ListOverlay list={active} board={board} />}</DragOverlay>
    </DndContext>
  )
}
