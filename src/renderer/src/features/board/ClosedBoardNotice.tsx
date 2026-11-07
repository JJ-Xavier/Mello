// Quadro fechado aberto pelo endereço (quadro ou calendário do quadro): o aviso com "Reabrir".
import type { BoardSummary } from '../../../../shared/ipc/boards'
import ui from '../../components/ui.module.css'
import { api, unwrap } from '../../lib/api'
import { useAction } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import styles from './BoardPage.module.css'

export function ClosedBoardNotice({ board }: { board: BoardSummary }) {
  const run = useAction()
  return (
    <div className={styles.page}>
      <div className={styles.closedNotice} role="status">
        <h2>Este quadro está fechado</h2>
        <p>
          &ldquo;{board.title}&rdquo; não aparece no Início. Reabra para voltar a usar, ou exclua de
          vez em &ldquo;Ver todos os quadros fechados&rdquo;.
        </p>
        <button
          type="button"
          className={ui.pri}
          style={{ alignSelf: 'flex-start' }}
          onClick={() =>
            run(
              () => unwrap(api().boards.reopen({ boardId: board.id })),
              [queryKeys.boards, queryKeys.board(board.id)]
            )
          }
        >
          Reabrir quadro
        </button>
      </div>
    </div>
  )
}
