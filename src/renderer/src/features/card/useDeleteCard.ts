import type { CardDetail } from '../../../../shared/ipc/cards'
import { useConfirm } from '../../components/useConfirm'
import { api, unwrap } from '../../lib/api'
import { useAction } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'

// "Excluir" do card (CAR-05): pede confirmação (NovosEstados.dc.html) e apaga de vez.
export function useDeleteCard(card: CardDetail, onDeleted: () => void) {
  const confirm = useConfirm()
  const run = useAction()
  return async () => {
    const ok = await confirm({
      title: 'Excluir card?',
      message: `“${card.title}” e os anexos dele saem do Mello de vez. Para tirar do quadro sem perder, use Arquivar.`,
      confirmLabel: 'Excluir'
    })
    if (!ok) return
    const done = await run(
      () => unwrap(api().cards.delete({ cardId: card.id })).then(() => true),
      [queryKeys.board(card.boardId), queryKeys.archived(card.boardId)]
    )
    if (done) onDeleted()
  }
}
