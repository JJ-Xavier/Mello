// Seletor de prioridade (Estados.dc.html): os 5 níveis com ícone e nome (PRI-03) e "Sem
// prioridade".
import { PRIORITIES } from '../../../../shared/rules/priority'
import { Icon } from '../../components/Icon'
import { PopoverHeader } from '../../components/Popover'
import { PriorityIcon } from '../../components/PriorityIcon'
import ui from '../../components/ui.module.css'
import { cx } from '../../lib/cx'
import styles from './CardModal.module.css'

export function PriorityPicker({
  value,
  onPick,
  close,
  onBack
}: {
  value: number | null
  onPick: (value: number | null) => void
  close: () => void
  onBack?: () => void
}) {
  const pick = (next: number | null) => {
    close()
    if (next !== value) onPick(next)
  }
  return (
    <>
      <PopoverHeader title="Prioridade" onClose={close} onBack={onBack} />
      <div role="radiogroup" aria-label="Prioridade" className={styles.stack}>
        {PRIORITIES.map((p) => (
          <button
            key={p.value}
            type="button"
            role="radio"
            aria-checked={p.value === value}
            className={cx(ui.mi, p.value === value && styles.selected)}
            onClick={() => pick(p.value)}
          >
            <PriorityIcon value={p.value} />
            <span className={styles.grow}>{p.name}</span>
            {p.value === value && (
              <span className={styles.selectedMark}>
                <Icon name="check" />
              </span>
            )}
          </button>
        ))}
      </div>
      <div className={ui.sep} />
      <button type="button" className={ui.mi} onClick={() => pick(null)}>
        Sem prioridade
      </button>
    </>
  )
}
