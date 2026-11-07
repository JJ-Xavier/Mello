// "Ver todos os quadros fechados" (QUA-04, QUA-07): reabrir ou excluir de vez, com confirmação.
import { BoardThumb } from '../../components/BoardThumb'
import { useConfirm } from '../../components/useConfirm'
import { PopoverHeader } from '../../components/Popover'
import ui from '../../components/ui.module.css'
import { api, unwrap } from '../../lib/api'
import { formatShortDate } from '../../lib/format'
import { useAction, useClosedBoards } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import type { BoardSummary } from '../../../../shared/ipc/boards'
import styles from './HomePage.module.css'

export function ClosedBoards({ close }: { close: () => void }) {
  const { data: closed = [] } = useClosedBoards()
  const run = useAction()
  const confirm = useConfirm()

  const reopen = (board: BoardSummary) =>
    run(() => unwrap(api().boards.reopen({ boardId: board.id })), [queryKeys.boards])

  const remove = async (board: BoardSummary) => {
    const ok = await confirm({
      title: 'Excluir quadro?',
      message: `"${board.title}" e tudo o que está nele (listas, cards, anexos e repetições) saem do Mello de vez.`,
      confirmLabel: 'Excluir'
    })
    if (ok) await run(() => unwrap(api().boards.delete({ boardId: board.id })), [queryKeys.boards])
  }

  return (
    <>
      <PopoverHeader title="Quadros fechados" onClose={close} />
      {closed.length === 0 && <p className={ui.note}>Nenhum quadro fechado.</p>}
      {closed.map((board) => (
        <div key={board.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className={styles.closedItem}>
            <BoardThumb background={board.background} />
            <span className={styles.closedText}>
              <span className={styles.closedTitle}>{board.title}</span>
              <span className={styles.closedWhen}>
                fechado em {formatShortDate(board.closedAt ?? 0)}
              </span>
            </span>
          </div>
          <div className={styles.closedActions}>
            <button type="button" className={ui.lnk} onClick={() => reopen(board)}>
              Reabrir
            </button>
            <button
              type="button"
              className={`${ui.lnk} ${ui.danger}`}
              onClick={() => remove(board)}
            >
              Excluir
            </button>
          </div>
        </div>
      ))}
      <p className={ui.note} style={{ marginTop: 4 }}>
        Excluir apaga o quadro e tudo o que está nele, de vez.
      </p>
    </>
  )
}
