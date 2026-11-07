// Barra do quadro (Quadro.dc.html): título editável, filtro (FLT), favoritar, "Alterar fundo"
// (o editor de fundo, FUN) e o menu "…" com itens arquivados, transformar em modelo (MOD-04) e
// fechar quadro (NovosEstados.dc.html).
import { useId, useState } from 'react'
import { useNavigate } from 'react-router'
import type { BoardDetail } from '../../../../shared/ipc/boards'
import { BOARD_TITLE_MAX, FILTER_KEYWORD_MAX } from '../../../../shared/limits'
import { isFilterActive, NO_FILTER, type BoardFilter } from '../../../../shared/rules/filter'
import { PRIORITIES } from '../../../../shared/rules/priority'
import { EditableTitle } from '../../components/EditableTitle'
import { Icon } from '../../components/Icon'
import { Popover, PopoverHeader } from '../../components/Popover'
import { PriorityIcon } from '../../components/PriorityIcon'
import ui from '../../components/ui.module.css'
import { api, unwrap } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useAction } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import { ChangeBackground } from '../background/ChangeBackground'
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

  // MOD-04: o modelo sai do Início e vai para a seção "Modelos"; o quadro continua aberto.
  const toggleTemplate = () => {
    close()
    void run(
      () => unwrap(api().templates.setBoard({ boardId: board.id, isTemplate: !board.isTemplate })),
      [queryKeys.boards, queryKeys.board(board.id)]
    )
  }

  return (
    <>
      <PopoverHeader title="Opções do quadro" onClose={close} />
      <button type="button" className={ui.mi} onClick={() => setView('archived')}>
        <Icon name="archive" />
        Itens arquivados
      </button>
      <button type="button" className={ui.mi} onClick={toggleTemplate}>
        <Icon name="template" />
        {board.isTemplate ? 'Deixar de ser modelo' : 'Transformar em modelo'}
      </button>
      <div className={ui.sep} />
      <button type="button" className={`${ui.mi} ${ui.danger}`} onClick={closeBoard}>
        <Icon name="close" />
        Fechar quadro
      </button>
    </>
  )
}

// Filtro do quadro (Estados.dc.html): palavra-chave (FLT-01), prioridades (FLT-02) e "Só cards
// recorrentes" (FLT-03).
function FilterPanel({
  filter,
  onFilter,
  close
}: {
  filter: BoardFilter
  onFilter: (filter: BoardFilter) => void
  close: () => void
}) {
  const togglePriority = (value: number, on: boolean) =>
    onFilter({
      ...filter,
      priorities: on ? [...filter.priorities, value] : filter.priorities.filter((p) => p !== value)
    })
  return (
    <>
      <PopoverHeader title="Filtrar" onClose={close} />
      <input
        className={ui.fld}
        placeholder="Palavra-chave..."
        aria-label="Filtrar por palavra-chave"
        value={filter.keyword}
        maxLength={FILTER_KEYWORD_MAX}
        autoFocus
        onChange={(event) => onFilter({ ...filter, keyword: event.target.value })}
      />
      <p className={ui.cap} style={{ margin: '6px 0 2px' }}>
        PRIORIDADE
      </p>
      {PRIORITIES.map((p) => (
        <label key={p.value} className={styles.filterOption}>
          <input
            type="checkbox"
            className={ui.check}
            checked={filter.priorities.includes(p.value)}
            onChange={(event) => togglePriority(p.value, event.target.checked)}
          />
          <PriorityIcon value={p.value} />
          {p.name}
        </label>
      ))}
      <p className={ui.cap} style={{ margin: '6px 0 2px' }}>
        OUTROS
      </p>
      <label className={styles.filterOption}>
        <input
          type="checkbox"
          className={ui.check}
          checked={filter.recurringOnly}
          onChange={(event) => onFilter({ ...filter, recurringOnly: event.target.checked })}
        />
        Só cards recorrentes
      </label>
      {isFilterActive(filter) && (
        <button
          type="button"
          className={ui.sec}
          style={{ marginTop: 6 }}
          onClick={() => onFilter(NO_FILTER)}
        >
          Limpar filtro
        </button>
      )}
    </>
  )
}

export function BoardBar({
  board,
  filter,
  onFilter
}: {
  board: BoardDetail
  filter: BoardFilter
  onFilter: (filter: BoardFilter) => void
}) {
  const menuId = useId()
  const filterId = useId()
  const filtering = isFilterActive(filter)
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
        className={cx(styles.barIcon, filtering && styles.barIconActive)}
        aria-label={filtering ? 'Filtrar cards (filtro ativo)' : 'Filtrar cards'}
        popoverTarget={filterId}
      >
        <Icon name="filter" size={20} />
      </button>
      <Popover id={filterId} label="Filtrar" placement="belowEnd">
        {(close) => <FilterPanel filter={filter} onFilter={onFilter} close={close} />}
      </Popover>
      <button
        type="button"
        className={cx(styles.barIcon, board.isFavorite && styles.favorite)}
        aria-label={board.isFavorite ? 'Tirar dos favoritos' : 'Favoritar quadro'}
        aria-pressed={board.isFavorite}
        onClick={toggleFavorite}
      >
        <Icon name="star" size={20} />
      </button>
      <ChangeBackground boardId={board.id} />
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
