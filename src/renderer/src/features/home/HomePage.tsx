// Início (tela 1) e Início vazio (tela 10). Os quadros abertos aparecem com os favoritos primeiro e
// podem ser arrastados para mudar a ordem dentro do grupo (QUA-06).
import {
  closestCenter,
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import type { BoardSummary } from '../../../../shared/ipc/boards'
import { backgroundCss } from '../../../../shared/rules/background'
import { announcements, screenReaderInstructions, useDragSensors } from '../../components/dnd'
import { Icon } from '../../components/Icon'
import { Popover, PopoverHeader } from '../../components/Popover'
import { api, unwrap } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useAction, useBoards, useClosedBoards } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import { ClosedBoards } from './ClosedBoards'
import { CreateBoardForm } from './CreateBoardForm'
import styles from './HomePage.module.css'

function TileContent({ board }: { board: BoardSummary }) {
  return (
    <>
      <span className={styles.tileBg} style={{ background: backgroundCss(board.background) }} />
      <span className={styles.tileTitle}>{board.title}</span>
    </>
  )
}

function BoardTile({ board }: { board: BoardSummary }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: board.id,
    attributes: { roleDescription: 'quadro arrastável' }
  })
  return (
    <Link
      ref={setNodeRef}
      to={`/boards/${board.id}`}
      className={cx(styles.tile, isDragging && styles.tileDragging)}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      draggable={false}
      {...attributes}
      {...listeners}
      role={undefined}
      aria-label={board.title}
    >
      <TileContent board={board} />
    </Link>
  )
}

function CreateBoardTile() {
  const id = useId()
  return (
    <>
      <button type="button" className={styles.createTile} popoverTarget={id}>
        <Icon name="plus" size={20} />
        Criar novo quadro
      </button>
      <Popover id={id} label="Criar quadro">
        {(close) => (
          <>
            <PopoverHeader title="Criar quadro" onClose={close} />
            <CreateBoardForm onDone={close} />
          </>
        )}
      </Popover>
    </>
  )
}

// Mantém os favoritos na frente depois de um arraste (o grupo de cada quadro não muda).
function favoritesFirst(boards: BoardSummary[]): BoardSummary[] {
  return [...boards.filter((b) => b.isFavorite), ...boards.filter((b) => !b.isFavorite)]
}

function BoardGrid({ boards }: { boards: BoardSummary[] }) {
  const sensors = useDragSensors()
  const queryClient = useQueryClient()
  const run = useAction()
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = boards.find((b) => b.id === activeId)

  const onDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id))

  const onDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    setActiveId(null)
    if (!over || dragged.id === over.id) return
    const from = boards.findIndex((b) => b.id === dragged.id)
    const to = boards.findIndex((b) => b.id === over.id)
    const reordered = favoritesFirst(arrayMove(boards, from, to))
    const moving = boards[from]!
    const group = reordered.filter((b) => b.isFavorite === moving.isFavorite)
    const index = group.findIndex((b) => b.id === moving.id)
    queryClient.setQueryData(queryKeys.boards, reordered)
    void run(() => unwrap(api().boards.move({ boardId: moving.id, index })), [queryKeys.boards])
  }

  const nameOf = (id: unknown) => boards.find((b) => b.id === id)?.title ?? 'quadro'
  const positionOf = (id: unknown) => boards.findIndex((b) => b.id === id)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{ screenReaderInstructions, announcements: announcements(nameOf, positionOf) }}
    >
      <div className={styles.grid}>
        <SortableContext items={boards.map((b) => b.id)} strategy={rectSortingStrategy}>
          {boards.map((board) => (
            <BoardTile key={board.id} board={board} />
          ))}
        </SortableContext>
        <CreateBoardTile />
      </div>
      <DragOverlay>
        {active && (
          <div className={cx(styles.tile, styles.tileOverlay)}>
            <TileContent board={active} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

function EmptyInvite() {
  const id = useId()
  return (
    <section aria-labelledby={`${id}-title`} className={styles.invite}>
      <div className={styles.inviteArt} aria-hidden="true">
        <div className={styles.mini}>
          <b />
          <i />
          <i />
        </div>
        <div className={styles.mini}>
          <b />
          <i />
        </div>
        <div className={styles.mini}>
          <b />
        </div>
        <div className={styles.mini}>
          <b />
        </div>
      </div>
      <div className={styles.inviteText}>
        <h2 id={`${id}-title`} className={styles.inviteTitle}>
          Nenhum quadro ainda
        </h2>
        <p className={styles.inviteBody}>
          Crie um quadro para organizar suas listas e cards. Ele já vem com as listas A fazer, Em
          andamento, Concluído e Entregue, que você pode renomear ou apagar.
        </p>
        <button type="button" className={styles.inviteButton} popoverTarget={`${id}-pop`}>
          <Icon name="plus" />
          Criar seu primeiro quadro
        </button>
        <Popover id={`${id}-pop`} label="Criar quadro">
          {(close) => (
            <>
              <PopoverHeader title="Criar quadro" onClose={close} />
              <CreateBoardForm onDone={close} />
            </>
          )}
        </Popover>
      </div>
    </section>
  )
}

export function HomePage() {
  const boards = useBoards()
  const closed = useClosedBoards()
  const closedPopoverId = useId()

  if (!boards.data || !closed.data) return null
  const firstOpening = boards.data.length === 0 && closed.data.length === 0

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>SUAS ÁREAS DE TRABALHO</h1>
      <div className={styles.workspace}>
        <div className={styles.workspaceName}>
          <div className={styles.avatar} aria-hidden="true">
            P
          </div>
          Pessoal
        </div>
        {!firstOpening && (
          <div className={styles.workspaceLinks}>
            <Link to="/" className={styles.workspaceLink}>
              <Icon name="board" />
              Quadros
            </Link>
            <Link to="/settings" state={{ from: '/' }} className={styles.workspaceLink}>
              <Icon name="gear" />
              Configurações
            </Link>
          </div>
        )}
      </div>

      {firstOpening ? (
        <EmptyInvite />
      ) : (
        <>
          <BoardGrid boards={boards.data} />
          {closed.data.length > 0 && (
            <div>
              <button type="button" className={styles.closedButton} popoverTarget={closedPopoverId}>
                Ver todos os quadros fechados
              </button>
              <Popover id={closedPopoverId} label="Quadros fechados">
                {(close) => <ClosedBoards close={close} />}
              </Popover>
            </div>
          )}
        </>
      )}
    </div>
  )
}
