// "Criar quadro a partir de modelo" (MOD-05, NovoModelosQuadro.dc.html). "Abrir o modelo" abre o
// quadro-modelo para editar; o menu "…" dele tem "Deixar de ser modelo" (decidido na etapa 11).
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import type { BoardTemplate } from '../../../../shared/ipc/templates'
import { BOARD_TITLE_MAX } from '../../../../shared/limits'
import { backgroundCss } from '../../../../shared/rules/background'
import { Icon } from '../../components/Icon'
import ui from '../../components/ui.module.css'
import { api, unwrap } from '../../lib/api'
import { useAction } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import styles from './Templates.module.css'

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function BoardTemplateDialog({
  template,
  onClose
}: {
  template: BoardTemplate
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const navigate = useNavigate()
  const run = useAction()
  const [title, setTitle] = useState(template.title)
  const [keepCards, setKeepCards] = useState(true)
  const [saving, setSaving] = useState(false)
  const cards = count(template.cardCount, 'card', 'cards')

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal()
  }, [])

  const leave = (to: string) => {
    dialog.current?.close()
    navigate(to)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || saving) return
    setSaving(true)
    const created = await run(
      () =>
        unwrap(api().templates.createBoard({ templateId: template.id, title: trimmed, keepCards })),
      [queryKeys.boards]
    )
    setSaving(false)
    if (created) leave(`/boards/${created.id}`)
  }

  return (
    <dialog ref={dialog} aria-labelledby={titleId} className={styles.dialog} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'contents' }}>
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            Criar quadro a partir de modelo
          </h2>
          <button
            type="button"
            className={styles.x}
            aria-label="Fechar"
            onClick={() => dialog.current?.close()}
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className={styles.summary}>
          <div
            className={styles.preview}
            style={{ background: backgroundCss(template.background) }}
            aria-hidden="true"
          >
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className={styles.name}>{template.title}</span>
            <span className={styles.meta}>
              {count(template.listCount, 'lista', 'listas')} ·{' '}
              {count(template.labelCount, 'etiqueta', 'etiquetas')} · {cards}
            </span>
          </div>
        </div>
        <label className={ui.label} style={{ gap: 6 }}>
          Título do quadro
          <input
            className={styles.field}
            value={title}
            maxLength={BOARD_TITLE_MAX}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
          />
        </label>
        <label className={styles.keep}>
          <input
            type="checkbox"
            checked={keepCards}
            onChange={(event) => setKeepCards(event.target.checked)}
          />
          <span className={styles.keepText}>
            Manter os cards do modelo ({cards})
            <span className={styles.keepHint}>
              Os cards chegam sem o ✓, sem envelhecimento e sem a atividade antiga.
            </span>
          </span>
        </label>
        <p className={styles.info}>
          Listas (com as opções “Lista de conclusão” e “Não envelhece”), etiquetas e fundo sempre
          vêm junto.
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.open}
            onClick={() => leave(`/boards/${template.id}`)}
          >
            Abrir o modelo
          </button>
          <button type="button" className={ui.sec} onClick={() => dialog.current?.close()}>
            Cancelar
          </button>
          <button type="submit" className={ui.pri} disabled={!title.trim() || saving}>
            Criar quadro
          </button>
        </div>
      </form>
    </dialog>
  )
}
