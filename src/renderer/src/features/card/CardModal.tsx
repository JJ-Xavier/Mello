// Modal do card (Card.dc.html). Abre por cima da tela atual quando o endereço tem ?card=<id>, então
// o mesmo modal serve ao quadro e, na etapa 7, ao calendário. Nesta etapa é só a casca: lista, ✓ e
// título. Os campos entram nas etapas 4 e 5.
import { useCallback, useEffect, useId, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { DoneMark } from '../../components/DoneMark'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useCard } from '../../lib/queries'
import styles from './CardModal.module.css'

function CardDialog({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const { data: card, error } = useCard(cardId)
  const gone = error instanceof ApiError && error.code === 'NOT_FOUND'

  // Modal de verdade (foco preso, Esc fecha) e fechamento leve: clicar fora também fecha.
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    element.setAttribute('closedby', 'any')
    if (!element.open) element.showModal()
  }, [])

  // Card que não existe mais (excluído): o endereço volta para a tela de baixo.
  useEffect(() => {
    if (gone) onClose()
  }, [gone, onClose])

  const finished = card ? card.isDoneList && card.isDone : false

  return (
    <dialog ref={dialog} aria-labelledby={titleId} className={styles.modal} onClose={onClose}>
      <div className={styles.top}>
        {card && <span className={styles.list}>{card.listTitle}</span>}
        <div className={styles.spacer} />
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Fechar"
          onClick={() => dialog.current?.close()}
        >
          <Icon name="close" size={20} />
        </button>
      </div>
      <div className={styles.body}>
        {card && (
          <>
            <div className={styles.titleRow}>
              <DoneMark done={card.isDone} size={26} />
              <h1 id={titleId} className={cx(styles.title, finished && styles.titleFinished)}>
                {card.title}
              </h1>
            </div>
            <p className={styles.notice}>
              Em construção: etiquetas, prioridade, datas, descrição e checklist chegam na etapa 4;
              nota, atividade, anexos e capa, na etapa 5.
            </p>
          </>
        )}
      </div>
    </dialog>
  )
}

export function CardModal() {
  const [params, setParams] = useSearchParams()
  const cardId = params.get('card')

  // Fechar tira o ?card= do endereço sem criar um passo a mais no histórico.
  const close = useCallback(
    () =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.delete('card')
          return next
        },
        { replace: true }
      ),
    [setParams]
  )

  if (!cardId) return null
  return <CardDialog key={cardId} cardId={cardId} onClose={close} />
}
