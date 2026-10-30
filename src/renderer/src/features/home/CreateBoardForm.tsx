import { useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import ui from '../../components/ui.module.css'
import { BOARD_TITLE_MAX } from '../../../../shared/limits'
import { api, unwrap } from '../../lib/api'
import { useAction } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import styles from './CreateBoardForm.module.css'

// Usado no Início, no menu "Criar" e em "Mudar de quadros". Só cria quando você confirma; o
// quadro nasce com as 4 listas, as 6 etiquetas e o fundo Mello (QUA-02, QUA-03) e abre em seguida.
export function CreateBoardForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()
  const run = useAction()
  const inputId = useId()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || saving) return
    setSaving(true)
    const created = await run(
      () => unwrap(api().boards.create({ title: trimmed })),
      [queryKeys.boards]
    )
    setSaving(false)
    if (!created) return
    navigate(`/boards/${created.id}`)
    onDone()
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.preview} aria-hidden="true">
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
      <label className={ui.label} htmlFor={inputId}>
        Título do quadro
      </label>
      <input
        id={inputId}
        className={ui.fld}
        value={title}
        maxLength={BOARD_TITLE_MAX}
        onChange={(event) => setTitle(event.target.value)}
        autoFocus
      />
      <button
        type="submit"
        className={`${ui.pri} ${styles.submit}`}
        disabled={!title.trim() || saving}
      >
        Criar
      </button>
    </form>
  )
}
