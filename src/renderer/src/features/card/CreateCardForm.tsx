// "Criar card" do menu "Criar" (Estados.dc.html: "Escolha o quadro e a lista"). No mesmo visual do
// "Mover card" (NovosEstados.dc.html). Começa no quadro aberto, se houver; o card entra no fim da
// lista (CAR-02) e o quadro abre em seguida, como no "Criar quadro".
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { CARD_TITLE_MAX } from '../../../../shared/limits'
import ui from '../../components/ui.module.css'
import { api, unwrap } from '../../lib/api'
import { useAction, useBoard, useBoards } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import styles from './CreateCardForm.module.css'

export function CreateCardForm({ onDone }: { onDone: () => void }) {
  const { boardId: openBoard } = useParams()
  const boards = useBoards()
  const [chosenBoard, setChosenBoard] = useState('')
  const [chosenList, setChosenList] = useState('')
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()
  const run = useAction()

  const open = boards.data ?? []
  const boardId =
    [chosenBoard, openBoard].find((id) => id && open.some((b) => b.id === id)) ?? open[0]?.id ?? ''
  const board = useBoard(boardId)
  const lists = board.data?.lists ?? []
  const listId = lists.some((l) => l.id === chosenList) ? chosenList : (lists[0]?.id ?? '')

  if (boards.data && open.length === 0) {
    return (
      <p className={ui.note}>Crie um quadro primeiro: o card precisa de um quadro e uma lista.</p>
    )
  }

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || !listId || saving) return
    setSaving(true)
    const created = await run(
      () => unwrap(api().cards.create({ listId, title: trimmed })),
      [queryKeys.board(boardId)]
    )
    setSaving(false)
    if (!created) return
    navigate(`/boards/${boardId}`)
    onDone()
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={ui.label}>
        Quadro
        <select
          className={ui.fld}
          value={boardId}
          onChange={(event) => {
            setChosenBoard(event.target.value)
            setChosenList('')
          }}
        >
          {open.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      </label>
      <label className={ui.label}>
        Lista
        <select
          className={ui.fld}
          value={listId}
          onChange={(event) => setChosenList(event.target.value)}
          disabled={lists.length === 0}
        >
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
        </select>
      </label>
      <label className={ui.label}>
        Título do card
        <textarea
          className={`${ui.fld} ${styles.title}`}
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
      <button
        type="submit"
        className={`${ui.pri} ${styles.submit}`}
        disabled={!title.trim() || !listId || saving}
      >
        Adicionar cartão
      </button>
    </form>
  )
}
