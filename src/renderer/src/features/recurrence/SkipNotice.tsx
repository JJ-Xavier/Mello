// Aviso de repetição pulada dentro do card (REP-08; Repeticao.dc.html e Estados.dc.html), com
// "Criar agora mesmo assim" e "Dispensar" (REP-09).
import type { CardDetail } from '../../../../shared/ipc/cards'
import type { SkipNotice as Notice } from '../../../../shared/ipc/recurrence'
import { occurrenceDayText } from '../../../../shared/rules/recurrence'
import { Icon } from '../../components/Icon'
import { api, unwrap } from '../../lib/api'
import { useCardAction } from '../card/useCardAction'
import styles from './Recurrence.module.css'

export function SkipNotice({ card, notice }: { card: CardDetail; notice: Notice }) {
  const act = useCardAction(card)
  // O mês abreviado já termina em ponto ("26 de out."): a frase não ganha outro.
  const day = notice.next ? occurrenceDayText(notice.next) : ''
  const next = notice.next
    ? `A próxima será ${day}${day.endsWith('.') ? '' : '.'}`
    : 'A repetição terminou.'
  return (
    <div role="status" className={styles.notice}>
      <Icon name="warning" size={20} />
      <div className={styles.noticeBody}>
        <span>
          <b>Repetição de {occurrenceDayText(notice.occurrence)} pulada.</b> Este card ainda não foi
          concluído, então o Mello não criou outro. {next}
        </span>
        <div className={styles.noticeActions}>
          <button
            type="button"
            className={styles.noticePrimary}
            onClick={() =>
              act(() =>
                unwrap(api().recurrence.createAnyway({ occurrenceId: notice.occurrenceId }))
              )
            }
          >
            Criar agora mesmo assim
          </button>
          <button
            type="button"
            className={styles.noticeSecondary}
            onClick={() =>
              act(() => unwrap(api().recurrence.dismiss({ occurrenceId: notice.occurrenceId })))
            }
          >
            Dispensar
          </button>
        </div>
      </div>
    </div>
  )
}
