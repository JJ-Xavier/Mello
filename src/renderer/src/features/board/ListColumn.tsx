// Uma lista do quadro. O cabeçalho é a alça do arraste (mouse ou espaço no teclado); clicar no
// título renomeia. Os cards entram na etapa 3.
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useId, type HTMLAttributes } from 'react'
import type { BoardDetail, ListSummary } from '../../../../shared/ipc/boards'
import { LIST_TITLE_MAX } from '../../../../shared/limits'
import { EditableTitle } from '../../components/EditableTitle'
import { Icon } from '../../components/Icon'
import { Popover } from '../../components/Popover'
import { api, unwrap } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useAction } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import styles from './ListColumn.module.css'
import { ListMenu } from './ListMenu'

interface ColumnBodyProps {
  list: ListSummary
  board: BoardDetail
  handleProps?: HTMLAttributes<HTMLDivElement>
  interactive: boolean
}

function ColumnBody({ list, board, handleProps, interactive }: ColumnBodyProps) {
  const menuId = useId()
  const run = useAction()

  const rename = (title: string) =>
    run(() => unwrap(api().lists.update({ listId: list.id, title })), [queryKeys.board(board.id)])

  return (
    <>
      <div className={styles.header} {...handleProps}>
        {interactive ? (
          <EditableTitle
            value={list.title}
            maxLength={LIST_TITLE_MAX}
            label="Nome da lista"
            onSave={rename}
            className={styles.title}
            buttonClassName={styles.titleButton}
            inputClassName={styles.titleInput}
          />
        ) : (
          <h2 className={styles.title}>{list.title}</h2>
        )}
        <span className={styles.count} aria-label={`${list.cardCount} cards`}>
          {list.cardCount}
        </span>
        <button
          type="button"
          className={styles.menuButton}
          aria-label="Ações da lista"
          popoverTarget={interactive ? menuId : undefined}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Icon name="dots" />
        </button>
        {interactive && (
          <Popover id={menuId} label={`Ações da lista ${list.title}`}>
            {(close) => <ListMenu list={list} board={board} close={close} />}
          </Popover>
        )}
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.addCard} disabled title="Chega na etapa 3">
          <Icon name="plus" />
          Adicionar um cartão
        </button>
        <button
          type="button"
          className={styles.template}
          aria-label="Criar a partir de modelo"
          disabled
          title="Chega na etapa 11"
        >
          <Icon name="template" />
        </button>
      </div>
    </>
  )
}

export function ListColumn({ list, board }: { list: ListSummary; board: BoardDetail }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id,
    attributes: { roleDescription: 'lista arrastável' }
  })
  return (
    <section
      ref={setNodeRef}
      aria-label={list.title}
      className={cx(styles.list, isDragging && styles.placeholder)}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <ColumnBody
        list={list}
        board={board}
        interactive
        handleProps={{ ...attributes, ...listeners, 'aria-label': `Lista ${list.title}` }}
      />
    </section>
  )
}

// Cópia da lista que segue o mouse durante o arraste.
export function ListOverlay({ list, board }: { list: ListSummary; board: BoardDetail }) {
  return (
    <section className={cx(styles.list, styles.overlay)}>
      <ColumnBody list={list} board={board} interactive={false} />
    </section>
  )
}
