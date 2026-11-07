// Peças das seções de Configurações: a caixa da seção, a opção liga/desliga e o aviso amarelo
// (Config.dc.html e NovoConfig.dc.html).
import { useId, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { cx } from '../../lib/cx'
import styles from './SettingsPage.module.css'

export function Section({
  id,
  title,
  lead,
  aside,
  children
}: {
  id: string
  title: string
  lead: string
  // À direita do título (o "Ativado" do envelhecimento).
  aside?: ReactNode
  children: ReactNode
}) {
  const titleId = `${id}-titulo`
  return (
    <section id={id} aria-labelledby={titleId} className={styles.box}>
      <div className={aside ? styles.headRow : undefined}>
        <div>
          <h2 id={titleId} className={styles.h2}>
            {title}
          </h2>
          <p className={styles.lead}>{lead}</p>
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

// Liga/desliga. Com `sub`, a explicação fica embaixo do texto e não entra no nome da opção.
export function Toggle({
  checked,
  onChange,
  sub,
  children
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  sub?: string
  children: ReactNode
}) {
  const id = useId()
  if (!sub) {
    return (
      <label className={styles.sw}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {children}
      </label>
    )
  }
  return (
    <div className={cx(styles.sw, styles.swTop)}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        aria-describedby={`${id}-sub`}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <label htmlFor={id}>{children}</label>
        <span id={`${id}-sub`} className={styles.sub}>
          {sub}
        </span>
      </span>
    </div>
  )
}

export function Warning({ children }: { children: ReactNode }) {
  return (
    <div role="status" className={styles.warn}>
      <span className={styles.warnIcon}>
        <Icon name="warning" />
      </span>
      <span>{children}</span>
    </div>
  )
}
