// Tela do quadro (tela 2): barra do quadro e listas. O fundo e a barra flutuante ficam no
// BoardLayout, que também cuida do quadro inexistente.
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import type { BoardDetail } from '../../../../shared/ipc/boards'
import { cardMatches, NO_FILTER, type BoardFilter } from '../../../../shared/rules/filter'
import ui from '../../components/ui.module.css'
import { api, unwrap } from '../../lib/api'
import { useAction, useBoard, useMatching } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import { useDebounced } from '../../lib/useDebounced'
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

  return <OpenBoard key={board.id} board={board} />
}

// O filtro (FLT) vive aqui e não fica salvo: trocar de quadro ou sair dele limpa (FLT-05).
function OpenBoard({ board }: { board: BoardDetail }) {
  const [filter, setFilter] = useState<BoardFilter>(NO_FILTER)
  const keyword = useDebounced(filter.keyword)
  const { data: matching } = useMatching(board.id, keyword)
  const visible = useMemo(() => {
    const ids = matching ? new Set(matching) : null
    const settled = { ...filter, keyword }
    return (card: BoardDetail['lists'][number]['cards'][number]) => cardMatches(card, settled, ids)
  }, [filter, keyword, matching])

  return (
    <div className={styles.page}>
      <BoardBar board={board} filter={filter} onFilter={setFilter} />
      <ListsArea board={board} filter={filter} visible={visible} />
    </div>
  )
}
