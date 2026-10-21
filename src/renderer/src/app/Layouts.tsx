import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router'
import { Icon } from '../components/Icon'
import { cx } from '../lib/cx'
import { AppHeader, type SettingsLocationState } from './AppHeader'
import { BoardNav } from './BoardNav'
import styles from './Layouts.module.css'

function sideClass({ isActive }: { isActive: boolean }): string {
  return cx(styles.sideItem, isActive && styles.sideActive)
}

// Início e calendário de todos os quadros: cabeçalho + menu lateral (Main.dc.html).
export function HomeLayout() {
  const location = useLocation()
  return (
    <div className={styles.screen}>
      <AppHeader variant="home" />
      <div className={styles.body}>
        <nav aria-label="Navegação principal" className={styles.sidebar}>
          <NavLink to="/" end className={sideClass}>
            <Icon name="board" />
            Quadros
          </NavLink>
          <NavLink to="/calendar" className={sideClass}>
            <Icon name="calendar" />
            Calendário
          </NavLink>
          <Link
            to="/settings"
            state={{ from: location.pathname } satisfies SettingsLocationState}
            className={styles.sideItem}
          >
            <Icon name="sliders" />
            Configurações
          </Link>
        </nav>
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

// Quadro e calendário do quadro: cabeçalho + conteúdo + barra flutuante de baixo.
export function BoardLayout() {
  const { boardId = '' } = useParams()
  return (
    <div className={styles.screen}>
      <AppHeader variant="board" />
      <div className={styles.boardArea}>
        <Outlet />
        <BoardNav boardId={boardId} />
      </div>
    </div>
  )
}

export function SettingsLayout() {
  return (
    <div className={styles.screen}>
      <AppHeader variant="settings" />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
