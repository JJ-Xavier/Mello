// Menu "…" do card (NovoCardCapaAnexos.dc.html) com "Mover" e "Copiar" (NovosEstados.dc.html):
// mover (CAR-06), copiar (CAR-07), arquivar e excluir (CAR-05). "Transformar em modelo" entra na
// etapa 11.
import { useState, type FormEvent } from 'react'
import type { CardDetail } from '../../../../shared/ipc/cards'
import { CARD_TITLE_MAX } from '../../../../shared/limits'
import { Icon } from '../../components/Icon'
import { PopoverHeader } from '../../components/Popover'
import ui from '../../components/ui.module.css'
import { api, unwrap } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useAction, useBoard, useBoards } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import styles from './CardModal.module.css'
import { useDeleteCard } from './useDeleteCard'

const COPY_SUFFIX = ' (cópia)'

// Quadro, lista e posição de destino. A posição conta os cards visíveis da lista sem o próprio
// card, como o canal cards:move; numa lista de outro quadro ou outra lista, há uma vaga a mais.
function useDestination(card: CardDetail, mode: 'move' | 'copy') {
  const boards = useBoards()
  const [boardId, setBoardId] = useState(card.boardId)
  const [chosenList, setChosenList] = useState(card.listId)
  const target = useBoard(boardId)
  const lists = target.data?.lists ?? []
  const listId = lists.some((l) => l.id === chosenList) ? chosenList : (lists[0]?.id ?? '')
  const list = lists.find((l) => l.id === listId)
  const others = (list?.cards ?? []).filter((c) => mode === 'copy' || c.id !== card.id)
  const currentIndex = (list?.cards ?? []).findIndex((c) => c.id === card.id)
  const positions = others.length + 1
  // Começa onde o card está (mover) ou logo abaixo dele (copiar); em outra lista, no fim.
  const initial =
    currentIndex === -1 ? positions - 1 : mode === 'copy' ? currentIndex + 1 : currentIndex
  const [chosenIndex, setChosenIndex] = useState<number | null>(null)
  const index = Math.min(chosenIndex ?? initial, positions - 1)

  const fields = (
    <>
      <label className={ui.label}>
        Quadro
        <select
          className={ui.fld}
          value={boardId}
          onChange={(event) => {
            setBoardId(event.target.value)
            setChosenList('')
            setChosenIndex(null)
          }}
        >
          {!(boards.data ?? []).some((b) => b.id === card.boardId) && (
            <option value={card.boardId}>Quadro atual</option>
          )}
          {(boards.data ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.destination}>
        <label className={ui.label}>
          Lista
          <select
            className={ui.fld}
            value={listId}
            disabled={lists.length === 0}
            onChange={(event) => {
              setChosenList(event.target.value)
              setChosenIndex(null)
            }}
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </label>
        <label className={ui.label}>
          Posição
          <select
            className={ui.fld}
            value={index}
            disabled={!list}
            onChange={(event) => setChosenIndex(Number(event.target.value))}
          >
            {Array.from({ length: positions }, (_, i) => (
              <option key={i} value={i}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
      </div>
      {boardId !== card.boardId && (
        <p className={ui.note}>Etiquetas que não existem no quadro de destino são criadas lá.</p>
      )}
    </>
  )
  return { boardId, listId, index, ready: list !== undefined, fields }
}

function MoveCard({ card, close, onBack }: MenuProps & { onBack: () => void }) {
  const destination = useDestination(card, 'move')
  const run = useAction()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    close()
    await run(
      () =>
        unwrap(
          api().cards.move({
            cardId: card.id,
            listId: destination.listId,
            index: destination.index
          })
        ),
      [queryKeys.card(card.id), queryKeys.board(card.boardId), queryKeys.board(destination.boardId)]
    )
  }

  return (
    <form className={styles.stack} style={{ gap: 10 }} onSubmit={submit}>
      <PopoverHeader title="Mover card" onClose={close} onBack={onBack} />
      {destination.fields}
      <button type="submit" className={cx(ui.pri, styles.start)} disabled={!destination.ready}>
        Mover
      </button>
    </form>
  )
}

function CopyCard({ card, close, onBack }: MenuProps & { onBack: () => void }) {
  const destination = useDestination(card, 'copy')
  const [title, setTitle] = useState(
    card.title.slice(0, CARD_TITLE_MAX - COPY_SUFFIX.length) + COPY_SUFFIX
  )
  const run = useAction()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    close()
    await run(
      () =>
        unwrap(
          api().cards.copy({
            cardId: card.id,
            title: title.trim(),
            listId: destination.listId,
            index: destination.index
          })
        ),
      [queryKeys.board(card.boardId), queryKeys.board(destination.boardId)]
    )
  }

  return (
    <form className={styles.stack} style={{ gap: 10 }} onSubmit={submit}>
      <PopoverHeader title="Copiar card" onClose={close} onBack={onBack} />
      <label className={ui.label}>
        Título
        <input
          className={ui.fld}
          value={title}
          maxLength={CARD_TITLE_MAX}
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      {destination.fields}
      <p className={ui.note}>
        Copia tudo, menos a atividade e a repetição. A cópia nasce sem envelhecimento.
      </p>
      <button
        type="submit"
        className={cx(ui.pri, styles.start)}
        disabled={!destination.ready || !title.trim()}
      >
        Criar cópia
      </button>
    </form>
  )
}

interface MenuProps {
  card: CardDetail
  close: () => void
}

export function CardMenu({ card, close, onDeleted }: MenuProps & { onDeleted: () => void }) {
  const [view, setView] = useState<'menu' | 'move' | 'copy'>('menu')
  const run = useAction()
  const remove = useDeleteCard(card, onDeleted)

  if (view === 'move') return <MoveCard card={card} close={close} onBack={() => setView('menu')} />
  if (view === 'copy') return <CopyCard card={card} close={close} onBack={() => setView('menu')} />

  const archive = () => {
    close()
    void run(
      () => unwrap(api().cards.archive({ cardId: card.id })),
      [queryKeys.card(card.id), queryKeys.board(card.boardId)]
    )
  }

  return (
    <>
      <PopoverHeader title="Ações do card" onClose={close} />
      <button type="button" className={ui.mi} onClick={() => setView('move')}>
        <Icon name="move" />
        Mover
      </button>
      <button type="button" className={ui.mi} onClick={() => setView('copy')}>
        <Icon name="copy" />
        Copiar
      </button>
      <button type="button" className={ui.mi} disabled title="Chega na etapa 11">
        <Icon name="template" />
        Transformar em modelo
      </button>
      <div className={ui.sep} />
      {card.archivedAt === null && (
        <button type="button" className={ui.mi} onClick={archive}>
          <Icon name="archive" />
          Arquivar
        </button>
      )}
      <button
        type="button"
        className={cx(ui.mi, ui.danger)}
        onClick={() => {
          close()
          void remove()
        }}
      >
        <Icon name="trash" />
        Excluir
      </button>
    </>
  )
}
