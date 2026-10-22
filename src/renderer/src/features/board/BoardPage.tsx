// Tela do quadro (tela 2): barra do quadro e listas. O fundo e a barra flutuante ficam no
// BoardLayout, que também cuida do quadro inexistente.
import { useParams } from 'react-router'
import ui from '../../components/ui.module.css'
import { api, unwrap } from '../../lib/api'
import { useAction, useBoard } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import { BoardBar } from './BoardBar'
import styles from './BoardPage.module.css'
import { ListsArea } from './ListsArea'

export function BoardPage() {
  const { boardId = '' } = useParams()
  const { data: board } = useBoard(boardId)
  const run = useAction()

  if (!board) return null

  if (board.closedAt !== null) {
    return (
      <div className={styles.page}>
        <div className={styles.closedNotice} role="status">
          <h2>Este quadro está fechado</h2>
          <p>
            &ldquo;{board.title}&rdquo; não aparece no Início. Reabra para voltar a usar, ou exclua
            de vez em &ldquo;Ver todos os quadros fechados&rdquo;.
          </p>
          <button
            type="button"
            className={ui.pri}
            style={{ alignSelf: 'flex-start' }}
            onClick={() =>
              run(
                () => unwrap(api().boards.reopen({ boardId })),
                [queryKeys.boards, queryKeys.board(boardId)]
              )
            }
          >
            Reabrir quadro
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <BoardBar board={board} />
      <ListsArea board={board} />
    </div>
  )
}
