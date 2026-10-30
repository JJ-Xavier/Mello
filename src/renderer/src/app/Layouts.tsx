import { Link, Navigate, NavLink, Outlet, useLocation, useParams } from 'react-router'
import { BoardBackdrop } from '../components/BoardBackdrop'
import { Icon } from '../components/Icon'
import { CardModal } from '../features/card/CardModal'
import { ApiError } from '../lib/api'
import { cx } from '../lib/cx'
import { useBoard } from '../lib/queries'
import { AppHeader, type SettingsLocationState } from './AppHeader'
import { BoardNav } from './BoardNav'
import styles from './Layouts.module.css'

function sideClass({ isActive }: { isActive: boolean }): string {
  return cx(styles.sideItem, isActive && styles.sideActive)
}

// Início e calendário de todos os quadros: cabeçalho + menu lateral (Main.dc.html) + o modal do
// card (?card=<id>), que o calendário abre por cima (CAL-11).
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
      <CardModal />
    </div>
  )
}

// Quadro e calendário do quadro: cabeçalho + conteúdo sobre o fundo do quadro (FUN-08) + barra
// flutuante de baixo + o modal do card (?card=<id>). Um quadro que não existe mais (excluído)
// volta para o Início.
export function BoardLayout() {
  const { boardId = '' } = useParams()
  const board = useBoard(boardId)
  if (board.error instanceof ApiError && board.error.code === 'NOT_FOUND') {
    return <Navigate to="/" replace />
  }
  return (
    <div className={cx(styles.screen, 'board-screen')}>
      <AppHeader variant="board" />
      <div className={styles.boardArea}>
        {board.data && <BoardBackdrop background={board.data.background} />}
        <Outlet />
        <BoardNav boardId={boardId} />
      </div>
      <CardModal />
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
