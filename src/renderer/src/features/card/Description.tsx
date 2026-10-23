// Descrição do card (NOT-07): o mesmo editor da nota, em modo leitura, com o botão "Editar".
// Salvar manda o documento do editor; o main limpa e gera o HTML (NOT-04).
import type { Editor } from '@tiptap/react'
import { useCallback, useRef, useState } from 'react'
import type { CardDetail } from '../../../../shared/ipc/cards'
import { Icon } from '../../components/Icon'
import { RichContent, RichEditor } from '../../components/RichEditor'
import ui from '../../components/ui.module.css'
import { api, unwrap } from '../../lib/api'
import styles from './CardModal.module.css'
import { useCardAction } from './useCardAction'

export function Description({ card }: { card: CardDetail }) {
  const [editing, setEditing] = useState(false)
  const editor = useRef<Editor | null>(null)
  const act = useCardAction(card)
  const onReady = useCallback((instance: Editor) => {
    editor.current = instance
  }, [])

  const save = async () => {
    const description = editor.current?.getJSON()
    setEditing(false)
    if (description) await act(() => unwrap(api().cards.update({ cardId: card.id, description })))
  }

  return (
    <section className={styles.section} aria-label="Descrição">
      <div className={styles.sectionHead}>
        <span className={styles.sectionIcon}>
          <Icon name="description" size={24} />
        </span>
        <h2 className={styles.sectionTitle}>Descrição</h2>
        {!editing && card.descriptionHtml && (
          <button type="button" className={styles.soft} onClick={() => setEditing(true)}>
            Editar
          </button>
        )}
      </div>
      <div className={styles.sectionBody}>
        {editing ? (
          <div
            className={styles.stack}
            style={{ gap: 10 }}
            onKeyDown={(event) => {
              // Esc sai da edição sem fechar o modal (no popover do link, só fecha o popover).
              const inPopover = (event.target as Element).closest('[popover]') !== null
              if (event.key === 'Escape' && !inPopover) {
                event.preventDefault()
                event.stopPropagation()
                setEditing(false)
              }
            }}
          >
            <RichEditor html={card.descriptionHtml} label="Descrição" onReady={onReady} />
            <div className={styles.buttonRow}>
              <button type="button" className={ui.pri} onClick={() => void save()}>
                Salvar
              </button>
              <button type="button" className={ui.sec} onClick={() => setEditing(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : card.descriptionHtml ? (
          <RichContent html={card.descriptionHtml} />
        ) : (
          <button type="button" className={styles.placeholder} onClick={() => setEditing(true)}>
            Adicione uma descrição mais detalhada…
          </button>
        )}
      </div>
    </section>
  )
}
