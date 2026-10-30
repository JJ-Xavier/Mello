// "Adicionar um cartão" (Estados.dc.html, "Novo card"): o card entra no fim da lista (CAR-02) e o
// campo continua aberto para o próximo. Enter adiciona; Esc fecha.
import { useState, type FormEvent } from 'react'
import { CARD_TITLE_MAX } from '../../../../shared/limits'
import { Icon } from '../../components/Icon'
import ui from '../../components/ui.module.css'
import { api, unwrap } from '../../lib/api'
import { useAction } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import styles from './ListColumn.module.css'

export function AddCard({
  boardId,
  listId,
  onClose
}: {
  boardId: string
  listId: string
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const run = useAction()

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    setTitle('')
    await run(
      () => unwrap(api().cards.create({ listId, title: trimmed })),
      [queryKeys.board(boardId)]
    )
  }

  return (
    <form className={styles.addCardForm} onSubmit={submit}>
      <textarea
        className={styles.addCardInput}
        placeholder="Insira um título para este cartão..."
        aria-label="Título do card"
        value={title}
        maxLength={CARD_TITLE_MAX}
        autoFocus
        // O título é uma linha só: quebras coladas viram espaço.
        onChange={(event) => setTitle(event.target.value.replace(/\s*\n\s*/g, ' '))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void submit()
          } else if (event.key === 'Escape') {
            onClose()
          }
        }}
      />
      <div className={styles.formRow}>
        <button type="submit" className={ui.pri}>
          Adicionar cartão
        </button>
        <button type="button" className={styles.cancel} aria-label="Cancelar" onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
      </div>
    </form>
  )
}
