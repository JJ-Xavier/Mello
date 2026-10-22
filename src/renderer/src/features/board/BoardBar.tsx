// Barra do quadro (Quadro.dc.html): título editável, filtro (etapa 4), favoritar, "Alterar fundo"
// (etapa 9) e o menu "…" com itens arquivados e fechar quadro (NovosEstados.dc.html).
import { useId, useState } from 'react'
import { useNavigate } from 'react-router'
import type { BoardDetail } from '../../../../shared/ipc/boards'
import { BOARD_TITLE_MAX } from '../../../../shared/limits'
import { EditableTitle } from '../../components/EditableTitle'
import { Icon } from '../../components/Icon'
import { Popover, PopoverHeader } from '../../components/Popover'
import ui from '../../components/ui.module.css'
import { api, unwrap } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useAction } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import { ArchivedItems } from './ArchivedItems'
import styles from './BoardPage.module.css'

function BoardMenu({ board, close }: { board: BoardDetail; close: () => void }) {
  const [view, setView] = useState<'menu' | 'archived'>('menu')
  const navigate = useNavigate()
  const run = useAction()

  if (view === 'archived') {
    return <ArchivedItems boardId={board.id} close={close} onBack={() => setView('menu')} />
  }

  // QUA-04: o quadro fechado sai do Início e fica em "Ver todos os quadros fechados".
  const closeBoard = async () => {
    close()
    await run(
      () => unwrap(api().boards.close({ boardId: board.id })),
      [queryKeys.boards, queryKeys.board(board.id)]
    )
    navigate('/')
  }

  return (
    <>
      <PopoverHeader title="Opções do quadro" onClose={close} />
      <button type="button" className={ui.mi} onClick={() => setView('archived')}>
        <Icon name="archive" />
        Itens arquivados
      </button>
      <button type="button" className={ui.mi} disabled title="Chega na etapa 11">
        <Icon name="template" />
        Transformar em modelo
      </button>
      <div className={ui.sep} />
      <button type="button" className={`${ui.mi} ${ui.danger}`} onClick={closeBoard}>
        <Icon name="close" />
        Fechar quadro
      </button>
    </>
  )
}

export function BoardBar({ board }: { board: BoardDetail }) {
  const menuId = useId()
  const run = useAction()
  const keys = [queryKeys.boards, queryKeys.board(board.id)]

  const rename = (title: string) =>
    run(() => unwrap(api().boards.update({ boardId: board.id, title })), keys)

  const toggleFavorite = () =>
    run(
      () => unwrap(api().boards.update({ boardId: board.id, isFavorite: !board.isFavorite })),
      keys
    )

  return (
    <div className={styles.bar}>
      <EditableTitle
        as="h1"
        value={board.title}
        maxLength={BOARD_TITLE_MAX}
        label="Nome do quadro"
        onSave={rename}
        className={styles.boardTitle}
        buttonClassName={styles.boardTitleButton}
        inputClassName={styles.boardTitleInput}
      />
      <div className={styles.spacer} />
      <button
        type="button"
        className={styles.barIcon}
        aria-label="Filtrar cards"
        disabled
        title="Chega na etapa 4"
      >
        <Icon name="filter" size={20} />
      </button>
      <button
        type="button"
        className={cx(styles.barIcon, board.isFavorite && styles.favorite)}
        aria-label={board.isFavorite ? 'Tirar dos favoritos' : 'Favoritar quadro'}
        aria-pressed={board.isFavorite}
        onClick={toggleFavorite}
      >
        <Icon name="star" size={20} />
      </button>
      <button type="button" className={styles.background} disabled title="Chega na etapa 9">
        <Icon name="image" />
        Alterar fundo
      </button>
      <button
        type="button"
        className={styles.barIcon}
        aria-label="Mais opções do quadro"
        popoverTarget={menuId}
      >
        <Icon name="dots" size={20} />
      </button>
      <Popover id={menuId} label="Opções do quadro" placement="belowEnd">
        {(close) => <BoardMenu board={board} close={close} />}
      </Popover>
    </div>
  )
}
