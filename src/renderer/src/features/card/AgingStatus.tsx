// Indicador do envelhecimento ao lado de "Última movimentação" (ENV-08, Card.dc.html): 5
// barrinhas, as N primeiras acesas, e "Parado há X dias · nível N de 5". Card congelado mostra
// "Não envelhece" e o motivo.
import type { CardDetail } from '../../../../shared/ipc/cards'
import { agingOf, AGING_LEVELS, type FrozenReason } from '../../../../shared/rules/aging'
import { cx } from '../../lib/cx'
import { useSettings } from '../../lib/queries'
import styles from './CardModal.module.css'

const FROZEN: Record<FrozenReason, string> = {
  disabled: 'desligado nas Configurações',
  list: 'lista congelada',
  finished: 'finalizado',
  template: 'modelo'
}

function idleText(days: number): string {
  if (days === 0) return 'menos de 1 dia'
  return days === 1 ? '1 dia' : `${days} dias`
}

export function AgingStatus({ card, now }: { card: CardDetail; now: number }) {
  const enabled = useSettings().data?.['aging.enabled'] ?? true
  const list = { freezesAging: card.listFreezesAging, isDoneList: card.isDoneList }
  const { level, days, frozen } = agingOf(card, list, enabled, now)
  return (
    <span className={styles.aging}>
      <span className={styles.agingBars} aria-hidden="true">
        {Array.from({ length: AGING_LEVELS }, (_, i) => (
          <span key={i} className={cx(styles.agingBar, i < level && styles.agingBarOn)} />
        ))}
      </span>
      {frozen
        ? `Não envelhece · ${FROZEN[frozen]}`
        : `Parado há ${idleText(days)} · nível ${level} de ${AGING_LEVELS}`}
    </span>
  )
}
