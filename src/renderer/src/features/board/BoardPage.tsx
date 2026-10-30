// Tela do quadro (tela 2): barra do quadro e listas. O fundo e a barra flutuante ficam no
// BoardLayout, que também cuida do quadro inexistente. O tom do envelhecimento (FUN-09) vem do
// fundo do quadro e vale para os cards de dentro.
import { useMemo, useState, type CSSProperties } from 'react'
import { useParams } from 'react-router'
import type { BoardDetail } from '../../../../shared/ipc/boards'
import { cardMatches, NO_FILTER, type BoardFilter } from '../../../../shared/rules/filter'
import { useBoard, useMatching, useSettings } from '../../lib/queries'
import { useDebounced } from '../../lib/useDebounced'
import { BoardBar } from './BoardBar'
import styles from './BoardPage.module.css'
import { ClosedBoardNotice } from './ClosedBoardNotice'
import { ListsArea } from './ListsArea'

export function BoardPage() {
  const { boardId = '' } = useParams()
  const { data: board } = useBoard(boardId)
  // As configurações (envelhecimento ligado?) chegam junto com o quadro.
  useSettings()

  if (!board) return null
  if (board.closedAt !== null) return <ClosedBoardNotice board={board} />
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
    <div className={styles.page} style={{ '--aging-tone': board.bgTone } as CSSProperties}>
      <BoardBar board={board} filter={filter} onFilter={setFilter} />
      <ListsArea board={board} filter={filter} visible={visible} />
    </div>
  )
}
