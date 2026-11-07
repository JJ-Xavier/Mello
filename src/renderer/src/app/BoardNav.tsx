import { useId, useState } from 'react'
import { Link, NavLink } from 'react-router'
import { BoardThumb } from '../components/BoardThumb'
import { Icon } from '../components/Icon'
import { Popover, PopoverHeader } from '../components/Popover'
import ui from '../components/ui.module.css'
import { CreateBoardForm } from '../features/home/CreateBoardForm'
import { cx } from '../lib/cx'
import { useBoards } from '../lib/queries'
import styles from './BoardNav.module.css'

function itemClass({ isActive }: { isActive: boolean }): string {
  return cx(styles.item, isActive && styles.active)
}

// "Mudar de quadros" (Estados.dc.html): os quadros abertos, favoritos primeiro (QUA-06), com o
// atual destacado, e "Criar novo quadro".
function SwitchBoards({ currentId, close }: { currentId: string; close: () => void }) {
  const { data: boards = [] } = useBoards()
  const [creating, setCreating] = useState(false)

  if (creating) {
    return (
      <>
        <PopoverHeader title="Criar quadro" onClose={close} onBack={() => setCreating(false)} />
        <CreateBoardForm onDone={close} />
      </>
    )
  }

  return (
    <>
      <PopoverHeader title="Seus quadros" onClose={close} />
      {boards.map((board) => (
        <Link
          key={board.id}
          to={`/boards/${board.id}`}
          className={ui.mi}
          onClick={close}
          aria-current={board.id === currentId ? 'page' : undefined}
          style={{
            padding: '6px 10px',
            background: board.id === currentId ? 'var(--accent-soft)' : undefined
          }}
        >
          <BoardThumb background={board.background} />
          <span style={{ color: 'var(--strong)', fontWeight: 500 }}>{board.title}</span>
        </Link>
      ))}
      <button
        type="button"
        className={ui.mi}
        style={{ padding: '6px 10px' }}
        onClick={() => setCreating(true)}
      >
        <span
          style={{
            width: 48,
            height: 32,
            borderRadius: 4,
            background: 'var(--sec)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Icon name="plus" />
        </span>
        Criar novo quadro
      </button>
    </>
  )
}

// Navegação do quadro: Quadro, Calendário e Mudar de quadros, só nesta barra (briefing).
export function BoardNav({ boardId }: { boardId: string }) {
  const base = `/boards/${encodeURIComponent(boardId)}`
  const switchId = useId()
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
      <button type="button" className={styles.item} popoverTarget={switchId}>
        <Icon name="switchBoards" />
        Mudar de quadros
      </button>
      <Popover id={switchId} label="Seus quadros" placement="above">
        {(close) => <SwitchBoards currentId={boardId} close={close} />}
      </Popover>
    </nav>
  )
}
