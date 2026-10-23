// Uma lista do quadro. O cabeçalho é a alça do arraste da lista (mouse ou espaço no teclado);
// clicar no título renomeia. Cada card também se arrasta (pelo card inteiro) e abre o modal com
// um clique ou Enter.
import { useDraggable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useCallback, useId, useLayoutEffect, useRef, useState, type HTMLAttributes } from 'react'
import { Link } from 'react-router'
import type { BoardDetail, ListDetail } from '../../../../shared/ipc/boards'
import type { CardSummary } from '../../../../shared/ipc/cards'
import { LIST_TITLE_MAX } from '../../../../shared/limits'
import { isFinished } from '../../../../shared/rules/finished'
import { EditableTitle } from '../../components/EditableTitle'
import { Icon } from '../../components/Icon'
import { Popover } from '../../components/Popover'
import { api, unwrap } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useAction } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import { AddCard } from './AddCard'
import cardStyles from './CardFace.module.css'
import { CardFace } from './CardFace'
import { listItems, type CardDrag } from './cardDrag'
import styles from './ListColumn.module.css'
import { ListMenu } from './ListMenu'

interface CardProps {
  card: CardSummary
  list: ListDetail
  ghost: boolean
  now: number
}

function BoardCard({ card, list, ghost, now }: CardProps) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: card.id,
    data: { type: 'card' },
    attributes: { roleDescription: 'card arrastável' }
  })
  return (
    <Link
      ref={setNodeRef}
      to={{ search: `?card=${card.id}` }}
      data-card-id={card.id}
      className={cx(cardStyles.card, ghost && cardStyles.ghost)}
      {...attributes}
      {...listeners}
      role={undefined}
    >
      <CardFace card={card} finished={isFinished(card.isDone, list)} now={now} />
    </Link>
  )
}

// Cópia do card que segue o mouse. Mostra o ✓ como vai ficar ao soltar (FIN-02, FIN-03).
export function CardOverlay({ card, list, now }: Omit<CardProps, 'ghost'>) {
  return (
    <div className={cx(cardStyles.card, cardStyles.overlay)}>
      <CardFace card={card} finished={isFinished(card.isDone, list)} now={now} />
    </div>
  )
}

interface ColumnBodyProps {
  list: ListDetail
  board: BoardDetail
  drag: CardDrag | null
  now: number
  // Filtro do quadro ativo: a lista mostra só os cards visíveis e o contador "visíveis/total".
  filtering: boolean
  handleProps?: HTMLAttributes<HTMLDivElement>
  interactive: boolean
}

function ColumnBody({
  list,
  board,
  drag,
  now,
  filtering,
  handleProps,
  interactive
}: ColumnBodyProps) {
  const menuId = useId()
  const run = useAction()
  const [adding, setAdding] = useState(false)
  const cardsRef = useRef<HTMLDivElement>(null)
  const items = listItems(list.cards, list.id, drag)
  // Como no protótipo, a lista de destino já conta o card que está chegando.
  const incoming = drag !== null && drag.target.listId === list.id && drag.origin.listId !== list.id
  const total = list.cardCount + (incoming ? 1 : 0)
  // FLT-04 e LIS-09: com filtro ativo, "visíveis/total".
  const shown = list.cards.length + (incoming ? 1 : 0)

  // Com o formulário aberto, o fim da lista fica à vista (o card novo entra lá).
  useLayoutEffect(() => {
    const element = cardsRef.current
    if (adding && element) element.scrollTop = element.scrollHeight
  }, [adding, list.cards.length])

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
        <span
          className={styles.count}
          aria-label={filtering ? `${shown} de ${total} cards` : `${total} cards`}
        >
          {filtering ? `${shown}/${total}` : total}
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
            {(close) => (
              <ListMenu list={list} board={board} close={close} onAddCard={() => setAdding(true)} />
            )}
          </Popover>
        )}
      </div>
      {items.length > 0 && (
        <div ref={cardsRef} className={styles.cards} data-cards="">
          {items.map((item) =>
            item.kind === 'slot' ? (
              <div
                key="vaga"
                className={cardStyles.slot}
                style={{ height: drag?.height }}
                data-slot=""
                aria-hidden="true"
              />
            ) : interactive ? (
              <BoardCard
                key={item.card.id}
                card={item.card}
                list={list}
                ghost={item.ghost}
                now={now}
              />
            ) : (
              <div key={item.card.id} className={cardStyles.card}>
                <CardFace
                  card={item.card}
                  finished={isFinished(item.card.isDone, list)}
                  now={now}
                />
              </div>
            )
          )}
        </div>
      )}
      {adding && interactive ? (
        <AddCard boardId={board.id} listId={list.id} onClose={() => setAdding(false)} />
      ) : (
        <div className={styles.footer}>
          <button type="button" className={styles.addCard} onClick={() => setAdding(true)}>
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
      )}
    </>
  )
}

interface ListColumnProps {
  list: ListDetail
  board: BoardDetail
  drag: CardDrag | null
  now: number
  filtering: boolean
  // O ListsArea mede as listas para saber onde o card arrastado vai cair.
  registerSection: (listId: string, element: HTMLElement | null) => void
}

export function ListColumn({
  list,
  board,
  drag,
  now,
  filtering,
  registerSection
}: ListColumnProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id,
    data: { type: 'list' },
    attributes: { roleDescription: 'lista arrastável' }
  })
  const ref = useCallback(
    (element: HTMLElement | null) => {
      setNodeRef(element)
      registerSection(list.id, element)
    },
    [setNodeRef, registerSection, list.id]
  )
  return (
    <section
      ref={ref}
      aria-label={list.title}
      className={cx(
        styles.list,
        isDragging && styles.placeholder,
        drag?.target.listId === list.id && styles.target
      )}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <ColumnBody
        list={list}
        board={board}
        drag={drag}
        now={now}
        filtering={filtering}
        interactive
        handleProps={{ ...attributes, ...listeners, 'aria-label': `Lista ${list.title}` }}
      />
    </section>
  )
}

// Cópia da lista que segue o mouse durante o arraste.
export function ListOverlay({
  list,
  board,
  now,
  filtering
}: {
  list: ListDetail
  board: BoardDetail
  now: number
  filtering: boolean
}) {
  return (
    <section className={cx(styles.list, styles.overlay)}>
      <ColumnBody
        list={list}
        board={board}
        drag={null}
        now={now}
        filtering={filtering}
        interactive={false}
      />
    </section>
  )
}
