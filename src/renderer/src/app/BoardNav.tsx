import { Link, NavLink } from 'react-router'
import { Icon } from '../components/Icon'
import { cx } from '../lib/cx'
import styles from './BoardNav.module.css'

function itemClass({ isActive }: { isActive: boolean }): string {
  return cx(styles.item, isActive && styles.active)
}

// Navegação do quadro: Quadro, Calendário e Mudar de quadros, só nesta barra (briefing).
// "Mudar de quadros" volta ao Início por enquanto; o popover de troca entra na etapa 2.
export function BoardNav({ boardId }: { boardId: string }) {
  const base = `/boards/${encodeURIComponent(boardId)}`
  return (
    <nav aria-label="Navegação do quadro" className={styles.nav}>
      <NavLink to={base} end className={itemClass}>
        <Icon name="board" />
        Quadro
      </NavLink>
      <NavLink to={`${base}/calendar`} className={itemClass}>
        <Icon name="calendar" />
        Calendário
      </NavLink>
      <Link to="/" className={styles.item}>
        <Icon name="switchBoards" />
        Mudar de quadros
      </Link>
    </nav>
  )
}
