// Menu "…" da lista (NovosEstados.dc.html, "atualizado"): copiar, mover, as duas opções
// independentes (LIS-02) e arquivar. "Adicionar cartão" e os "Ordenar" entram nas etapas 3 e 4.
import { useState } from 'react'
import type { BoardDetail, ListSummary } from '../../../../shared/ipc/boards'
import { PopoverHeader } from '../../components/Popover'
import ui from '../../components/ui.module.css'
import { api, unwrap } from '../../lib/api'
import { useAction, useBoard, useBoards } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'

interface ListMenuProps {
  list: ListSummary
  board: BoardDetail
  close: () => void
}

function MoveList({ list, board, close, onBack }: ListMenuProps & { onBack: () => void }) {
  const boards = useBoards()
  const [targetId, setTargetId] = useState(board.id)
  const target = useBoard(targetId)
  const sameBoard = targetId === board.id
  const currentIndex = board.lists.findIndex((l) => l.id === list.id)
  const positions = sameBoard ? board.lists.length : (target.data?.lists.length ?? 0) + 1
  const [position, setPosition] = useState(currentIndex)
  const run = useAction()

  const chooseBoard = (id: string) => {
    setTargetId(id)
    setPosition(id === board.id ? currentIndex : Number.MAX_SAFE_INTEGER)
  }

  const index = Math.min(position, positions - 1)

  const submit = async () => {
    const task = sameBoard
      ? () => unwrap(api().lists.move({ listId: list.id, index }))
      : () => unwrap(api().lists.moveToBoard({ listId: list.id, boardId: targetId, index }))
    close()
    await run(task, [queryKeys.board(board.id), queryKeys.board(targetId)])
  }

  return (
    <>
      <PopoverHeader title="Mover lista" onClose={close} onBack={onBack} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label className={ui.label}>
          Quadro
          <select
            className={ui.fld}
            value={targetId}
            onChange={(event) => chooseBoard(event.target.value)}
          >
            {(boards.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </label>
        <label className={ui.label}>
          Posição
          <select
            className={ui.fld}
            value={index}
            onChange={(event) => setPosition(Number(event.target.value))}
            disabled={!sameBoard && !target.data}
          >
            {Array.from({ length: Math.max(positions, 1) }, (_, i) => (
              <option key={i} value={i}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        {!sameBoard && (
          <p className={ui.note}>
            Os cards vão junto. Etiquetas que não existem no quadro de destino são criadas lá.
          </p>
        )}
        <button
          type="button"
          className={ui.pri}
          style={{ alignSelf: 'flex-start' }}
          onClick={submit}
          disabled={!sameBoard && !target.data}
        >
          Mover
        </button>
      </div>
    </>
  )
}

export function ListMenu({ list, board, close }: ListMenuProps) {
  const [view, setView] = useState<'menu' | 'move'>('menu')
  const run = useAction()
  const keys = [queryKeys.board(board.id)]

  if (view === 'move') {
    return <MoveList list={list} board={board} close={close} onBack={() => setView('menu')} />
  }

  const act = (task: () => Promise<unknown>) => {
    close()
    void run(task, keys)
  }

  const toggle = (changes: { isDoneList?: boolean; freezesAging?: boolean }) =>
    run(() => unwrap(api().lists.update({ listId: list.id, ...changes })), keys)

  return (
    <>
      <PopoverHeader title="Ações da lista" onClose={close} />
      <button type="button" className={ui.mi} disabled title="Chega na etapa 3">
        Adicionar cartão
      </button>
      <button
        type="button"
        className={ui.mi}
        onClick={() => act(() => unwrap(api().lists.copy({ listId: list.id })))}
      >
        Copiar lista
      </button>
      <button type="button" className={ui.mi} onClick={() => setView('move')}>
        Mover lista
      </button>
      <button type="button" className={ui.mi} disabled title="Chega na etapa 4">
        Ordenar por prioridade
      </button>
      <button type="button" className={ui.mi} disabled title="Chega na etapa 4">
        Ordenar por data de entrega
      </button>
      <div className={ui.sep} />
      <label className={ui.tog}>
        <span className={ui.togText}>
          Lista de conclusão
          <span className={ui.togHint}>
            Card que entra aqui é marcado como concluído (✓); ao sair, é desmarcado
          </span>
        </span>
        <input
          type="checkbox"
          className={ui.check}
          checked={list.isDoneList}
          onChange={(event) => toggle({ isDoneList: event.target.checked })}
        />
      </label>
      <label className={ui.tog}>
        <span className={ui.togText}>
          Cards desta lista não envelhecem
          <span className={ui.togHint}>Ligado em Concluído e Entregue</span>
        </span>
        <input
          type="checkbox"
          className={ui.check}
          checked={list.freezesAging}
          onChange={(event) => toggle({ freezesAging: event.target.checked })}
        />
      </label>
      <div className={ui.sep} />
      <button
        type="button"
        className={ui.mi}
        onClick={() => act(() => unwrap(api().lists.archiveCards({ listId: list.id })))}
      >
        Arquivar todos os cartões
      </button>
      <button
        type="button"
        className={`${ui.mi} ${ui.danger}`}
        onClick={() => act(() => unwrap(api().lists.archive({ listId: list.id })))}
      >
        Arquivar lista
      </button>
    </>
  )
}
