// Nota do card (NOT-01 a NOT-03): sempre aberta na coluna da direita, salva sozinha 800 ms depois
// que você para de digitar e também ao fechar o modal (ou o app). O main limpa e gera o HTML
// (NOT-04).
import type { Editor, JSONContent } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CardDetail } from '../../../../shared/ipc/cards'
import { NOTE_TEXT_MAX } from '../../../../shared/limits'
import { Icon } from '../../components/Icon'
import { RichEditor } from '../../components/RichEditor'
import { api, unwrap } from '../../lib/api'
import { cx } from '../../lib/cx'
import styles from './CardModal.module.css'
import { useCardAction } from './useCardAction'

export const NOTE_SAVE_DELAY = 800

type Status = 'saved' | 'pending' | 'error'

const STATUS_TEXT: Record<Status, string> = {
  saved: 'Salvo automaticamente',
  pending: 'Salvando…',
  error: 'Não foi possível salvar'
}

export function Note({ card }: { card: CardDetail }) {
  const [status, setStatus] = useState<Status>('saved')
  const act = useCardAction(card)
  // O documento ainda não salvo (null: nada pendente) e o relógio do salvamento.
  const unsaved = useRef<JSONContent | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const saveRef = useRef<() => void>(() => {})

  const save = useCallback(() => {
    clearTimeout(timer.current)
    const note = unsaved.current
    if (!note) return
    unsaved.current = null
    void act(() => unwrap(api().cards.update({ cardId: card.id, note })).then(() => true)).then(
      (ok) => {
        // Se você voltou a digitar enquanto salvava, continua "Salvando…".
        if (unsaved.current === null) setStatus(ok ? 'saved' : 'error')
      }
    )
  }, [act, card.id])
  useEffect(() => {
    saveRef.current = save
  }, [save])

  const onChange = useCallback((editor: Editor) => {
    unsaved.current = editor.getJSON()
    setStatus('pending')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => saveRef.current(), NOTE_SAVE_DELAY)
  }, [])

  // Esc na nota fecha o modal, como fora dela (não há edição para cancelar: o texto já é salvo).
  const section = useRef<HTMLElement>(null)
  const onEscape = useCallback(() => section.current?.closest('dialog')?.close(), [])

  // Fechar o modal (ou o app) salva o que estiver pendente.
  useEffect(() => {
    const flush = () => saveRef.current()
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [])

  return (
    <section ref={section} className={styles.note} aria-label="Nota">
      <div className={styles.asideHead}>
        <Icon name="note" size={20} />
        <h2 className={styles.asideTitle}>Nota</h2>
        <span className={cx(styles.noteStatus, status === 'error' && styles.noteError)}>
          {STATUS_TEXT[status]}
        </span>
      </div>
      <RichEditor
        html={card.noteHtml}
        label="Nota"
        limit={NOTE_TEXT_MAX}
        placeholder="Escreva aqui o que quiser lembrar sobre este card…"
        autofocus={false}
        variant="note"
        onChange={onChange}
        onEscape={onEscape}
      />
    </section>
  )
}
