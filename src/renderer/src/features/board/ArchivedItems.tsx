// "Itens arquivados" (NovosEstados.dc.html): cards e listas arquivados do quadro, com busca,
// restaurar e, nos cards, excluir de vez com confirmação (CAR-05, LIS-06).
import { useState } from 'react'
import type { ArchivedCard } from '../../../../shared/ipc/boards'
import { removeAccents } from '../../../../shared/text'
import { useConfirm } from '../../components/useConfirm'
import { PopoverHeader } from '../../components/Popover'
import ui from '../../components/ui.module.css'
import { api, unwrap } from '../../lib/api'
import { formatShortDate } from '../../lib/format'
import { useAction, useArchived } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'

const tabStyle = (selected: boolean) => ({
  flex: 1,
  height: 30,
  border: 0,
  borderRadius: 6,
  background: selected ? 'var(--sec)' : 'transparent',
  color: selected ? 'var(--sec-txt)' : 'var(--muted)',
  font: `${selected ? 600 : 500} 13px Inter, sans-serif`
})

const itemStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 6,
  padding: '8px 10px',
  borderRadius: 8,
  background: 'var(--item)'
}

function matches(title: string, search: string): boolean {
  const normalize = (value: string) => removeAccents(value).toLowerCase()
  return normalize(title).includes(normalize(search.trim()))
}

export function ArchivedItems({
  boardId,
  close,
  onBack
}: {
  boardId: string
  close: () => void
  onBack: () => void
}) {
  const { data } = useArchived(boardId)
  const [tab, setTab] = useState<'cards' | 'lists'>('cards')
  const [search, setSearch] = useState('')
  const run = useAction()
  const confirm = useConfirm()
  const keys = [queryKeys.board(boardId)]

  const cards = (data?.cards ?? []).filter((c) => matches(c.title, search))
  const lists = (data?.lists ?? []).filter((l) => matches(l.title, search))

  const removeCard = async (card: ArchivedCard) => {
    const ok = await confirm({
      title: 'Excluir card?',
      message: `"${card.title}" e os anexos dele saem do Mello de vez. Para tirar do quadro sem perder, use Arquivar.`,
      confirmLabel: 'Excluir'
    })
    if (ok) await run(() => unwrap(api().cards.delete({ cardId: card.id })), keys)
  }

  return (
    <>
      <PopoverHeader title="Itens arquivados" onClose={close} onBack={onBack} />
      <div
        role="tablist"
        aria-label="Tipo"
        style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 8, background: 'var(--item)' }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'cards'}
          style={tabStyle(tab === 'cards')}
          onClick={() => setTab('cards')}
        >
          Cards ({data?.cards.length ?? 0})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'lists'}
          style={tabStyle(tab === 'lists')}
          onClick={() => setTab('lists')}
        >
          Listas ({data?.lists.length ?? 0})
        </button>
      </div>
      <input
        className={ui.fld}
        placeholder="Buscar nos arquivados..."
        aria-label="Buscar nos arquivados"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        style={{ margin: '4px 0' }}
      />
      {tab === 'cards' &&
        (cards.length === 0 ? (
          <p className={ui.note}>Nenhum card arquivado.</p>
        ) : (
          cards.map((card) => (
            <div key={card.id} style={itemStyle}>
              <span style={{ fontSize: 14, color: 'var(--strong)' }}>{card.title}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {card.listTitle} · arquivado em {formatShortDate(card.archivedAt)}
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className={ui.lnk}
                  onClick={() => run(() => unwrap(api().cards.restore({ cardId: card.id })), keys)}
                >
                  Restaurar
                </button>
                <button
                  type="button"
                  className={`${ui.lnk} ${ui.danger}`}
                  onClick={() => removeCard(card)}
                >
                  Excluir
                </button>
              </span>
            </div>
          ))
        ))}
      {tab === 'lists' &&
        (lists.length === 0 ? (
          <p className={ui.note}>Nenhuma lista arquivada.</p>
        ) : (
          lists.map((list) => (
            <div key={list.id} style={itemStyle}>
              <span style={{ fontSize: 14, color: 'var(--strong)' }}>{list.title}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                arquivada em {formatShortDate(list.archivedAt)}
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className={ui.lnk}
                  onClick={() => run(() => unwrap(api().lists.restore({ listId: list.id })), keys)}
                >
                  Restaurar
                </button>
              </span>
            </div>
          ))
        ))}
    </>
  )
}
