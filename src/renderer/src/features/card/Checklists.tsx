// Checklists do card (Card.dc.html): título editável, "Ocultar itens marcados" (CHK-04), excluir,
// barra de progresso (CHK-02) e os itens, com marcar, editar, data da tarefa (CHK-05, CHK-06),
// excluir e "Adicionar um item". Checklists e itens se reordenam arrastando pelo título, com o
// mouse ou com o espaço do teclado.
import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'
import type { CardDetail } from '../../../../shared/ipc/cards'
import type { Checklist, ChecklistItem } from '../../../../shared/ipc/checklists'
import { CHECKLIST_TITLE_MAX, ITEM_TEXT_MAX } from '../../../../shared/limits'
import { itemDateState, progress } from '../../../../shared/rules/checklist'
import { screenReaderInstructions, useDragSensors } from '../../components/dnd'
import { EditableTitle } from '../../components/EditableTitle'
import { Icon } from '../../components/Icon'
import { Popover, PopoverHeader } from '../../components/Popover'
import ui from '../../components/ui.module.css'
import { useConfirm } from '../../components/useConfirm'
import { api, unwrap } from '../../lib/api'
import { cx } from '../../lib/cx'
import { formatItemDate } from '../../lib/format'
import { queryKeys } from '../../lib/queryKeys'
import styles from './CardModal.module.css'
import { DueForm } from './DatePicker'
import { useCardAction } from './useCardAction'

// "Data da tarefa" (NovoDataHoraA.dc.html): o dia e, se quiser, a hora, como no card, e "Mostrar
// no calendário" (CHK-05).
function ItemDate({
  item,
  close,
  onSave
}: {
  item: ChecklistItem
  close: () => void
  onSave: (due: { dueDate: string | null; showInCalendar: boolean }) => void
}) {
  const [show, setShow] = useState(item.showInCalendar)

  return (
    <DueForm
      title="Data da tarefa"
      dayLabel="Data"
      dueAt={item.dueDate}
      finished={item.isDone}
      top={<div className={styles.itemQuote}>{item.text}</div>}
      bottom={() => (
        <label className={styles.checkLine}>
          <input
            type="checkbox"
            className={ui.check}
            checked={show}
            onChange={(event) => setShow(event.target.checked)}
          />
          Mostrar no calendário
        </label>
      )}
      onSave={(dueDate) => onSave({ dueDate, showInCalendar: show })}
      onRemove={() => onSave({ dueDate: null, showInCalendar: show })}
      close={close}
    />
  )
}

function ItemRow({ card, item, now }: { card: CardDetail; item: ChecklistItem; now: number }) {
  const dateId = useId()
  const menuId = useId()
  const act = useCardAction(card)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    attributes: { roleDescription: 'item arrastável' }
  })
  const state = item.dueDate ? itemDateState(item.dueDate, item.isDone, now) : null

  return (
    <div
      ref={setNodeRef}
      className={cx(styles.item, isDragging && styles.dragging)}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <input
        type="checkbox"
        className={styles.itemCheck}
        checked={item.isDone}
        aria-label={item.text}
        onChange={(event) =>
          act(() => unwrap(api().items.toggle({ itemId: item.id, isDone: event.target.checked })))
        }
      />
      <EditableTitle
        as="div"
        value={item.text}
        maxLength={ITEM_TEXT_MAX}
        label="Texto do item"
        onSave={(text) => act(() => unwrap(api().items.update({ itemId: item.id, text })))}
        className={cx(styles.itemText, item.isDone && styles.itemDone)}
        buttonClassName={styles.itemTextButton}
        inputClassName={styles.itemInput}
        buttonProps={{ ...attributes, ...listeners, title: 'Clique para editar' }}
      />
      {item.dueDate && state ? (
        <button
          type="button"
          className={cx(styles.itemDate, styles[state])}
          popoverTarget={dateId}
          aria-label={`Data da tarefa: ${formatItemDate(item.dueDate)}${state === 'late' ? ', em atraso' : ''}`}
        >
          <Icon name="clock" size={14} />
          {formatItemDate(item.dueDate)}
        </button>
      ) : (
        <button
          type="button"
          className={styles.roundButton}
          popoverTarget={dateId}
          aria-label="Definir data da tarefa"
        >
          <Icon name="clock" size={14} />
        </button>
      )}
      <Popover id={dateId} label="Data da tarefa" placement="belowEnd">
        {(close) => (
          <ItemDate
            item={item}
            close={close}
            onSave={(due) => act(() => unwrap(api().items.update({ itemId: item.id, due })))}
          />
        )}
      </Popover>
      <button
        type="button"
        className={styles.roundButton}
        popoverTarget={menuId}
        aria-label="Ações do item"
      >
        <Icon name="dots" size={14} />
      </button>
      <Popover id={menuId} label="Ações do item" placement="belowEnd">
        {(close) => (
          <>
            <PopoverHeader title="Ações do item" onClose={close} />
            <button
              type="button"
              className={cx(ui.mi, ui.danger)}
              onClick={() => {
                close()
                void act(() => unwrap(api().items.delete({ itemId: item.id })))
              }}
            >
              <Icon name="trash" />
              Excluir item
            </button>
          </>
        )}
      </Popover>
    </div>
  )
}

function AddItem({ card, checklistId }: { card: CardDetail; checklistId: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const act = useCardAction(card)

  if (!open) {
    return (
      <div className={styles.addItem}>
        <button type="button" className={styles.soft} onClick={() => setOpen(true)}>
          Adicionar um item
        </button>
      </div>
    )
  }

  // Depois de adicionar, o campo continua aberto para o próximo item.
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    setText('')
    await act(() => unwrap(api().items.create({ checklistId, text: trimmed })))
  }

  return (
    <form className={styles.addItemForm} onSubmit={submit}>
      <input
        className={ui.fld}
        value={text}
        maxLength={ITEM_TEXT_MAX}
        placeholder="Adicionar um item"
        aria-label="Novo item"
        autoFocus
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            setOpen(false)
          }
        }}
      />
      <div className={styles.buttonRow}>
        <button type="submit" className={ui.pri}>
          Adicionar
        </button>
        <button type="button" className={ui.sec} onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function ChecklistSection({
  card,
  checklist,
  now
}: {
  card: CardDetail
  checklist: Checklist
  now: number
}) {
  const act = useCardAction(card)
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const sensors = useDragSensors()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: checklist.id,
    attributes: { roleDescription: 'checklist arrastável' }
  })
  const done = checklist.items.filter((i) => i.isDone).length
  const pct = progress(done, checklist.items.length)
  const shown = checklist.hideChecked ? checklist.items.filter((i) => !i.isDone) : checklist.items

  const remove = async () => {
    const ok = await confirm({
      title: 'Excluir checklist?',
      message: `“${checklist.title}” e os itens dele saem do card de vez.`,
      confirmLabel: 'Excluir'
    })
    if (ok) await act(() => unwrap(api().checklists.delete({ checklistId: checklist.id })))
  }

  // Reordenar itens: a tela muda na hora e o main grava (índice entre todos os itens).
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = checklist.items.findIndex((i) => i.id === active.id)
    const to = checklist.items.findIndex((i) => i.id === over.id)
    queryClient.setQueryData<CardDetail>(
      queryKeys.card(card.id),
      (current) =>
        current && {
          ...current,
          checklists: current.checklists.map((c) =>
            c.id === checklist.id ? { ...c, items: arrayMove(c.items, from, to) } : c
          )
        }
    )
    void act(() => unwrap(api().items.move({ itemId: String(active.id), index: to })))
  }

  return (
    <section
      ref={setNodeRef}
      aria-label={checklist.title}
      className={cx(styles.section, isDragging && styles.dragging)}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <div className={styles.sectionHead}>
        <span className={styles.sectionIcon}>
          <Icon name="checklist" size={24} />
        </span>
        <EditableTitle
          value={checklist.title}
          maxLength={CHECKLIST_TITLE_MAX}
          label="Nome do checklist"
          onSave={(title) =>
            act(() => unwrap(api().checklists.update({ checklistId: checklist.id, title })))
          }
          className={styles.sectionTitle}
          buttonClassName={styles.sectionTitleButton}
          inputClassName={styles.sectionTitleInput}
          buttonProps={{ ...attributes, ...listeners }}
        />
        {/* REP-04: a repetição copia o checklist desmarcado (Repeticao.dc.html). */}
        {card.recurrence?.copyChecklist && (
          <span className={styles.repeatHint}>Volta desmarcado a cada repetição</span>
        )}
        {(done > 0 || checklist.hideChecked) && (
          <button
            type="button"
            className={styles.soft}
            aria-pressed={checklist.hideChecked}
            onClick={() =>
              act(() =>
                unwrap(
                  api().checklists.update({
                    checklistId: checklist.id,
                    hideChecked: !checklist.hideChecked
                  })
                )
              )
            }
          >
            {checklist.hideChecked ? `Mostrar itens marcados (${done})` : 'Ocultar itens marcados'}
          </button>
        )}
        <button type="button" className={styles.soft} onClick={() => void remove()}>
          Excluir
        </button>
      </div>
      <div className={styles.progress}>
        <span className={styles.pct}>{pct}%</span>
        <div
          className={styles.bar}
          role="progressbar"
          aria-label={`Progresso de ${checklist.title}`}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cx(styles.barFill, pct === 100 && styles.barComplete)}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className={styles.items}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{ screenReaderInstructions }}
        >
          <SortableContext items={shown.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {shown.map((item) => (
              <ItemRow key={item.id} card={card} item={item} now={now} />
            ))}
          </SortableContext>
        </DndContext>
        <AddItem card={card} checklistId={checklist.id} />
      </div>
    </section>
  )
}

export function Checklists({ card, now }: { card: CardDetail; now: number }) {
  const act = useCardAction(card)
  const queryClient = useQueryClient()
  const sensors = useDragSensors()

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = card.checklists.findIndex((c) => c.id === active.id)
    const to = card.checklists.findIndex((c) => c.id === over.id)
    queryClient.setQueryData<CardDetail>(
      queryKeys.card(card.id),
      (current) => current && { ...current, checklists: arrayMove(current.checklists, from, to) }
    )
    void act(() => unwrap(api().checklists.move({ checklistId: String(active.id), index: to })))
  }

  if (card.checklists.length === 0) return null
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{ screenReaderInstructions }}
    >
      <SortableContext
        items={card.checklists.map((c) => c.id)}
        strategy={verticalListSortingStrategy}
      >
        {card.checklists.map((checklist) => (
          <ChecklistSection key={checklist.id} card={card} checklist={checklist} now={now} />
        ))}
      </SortableContext>
    </DndContext>
  )
}
