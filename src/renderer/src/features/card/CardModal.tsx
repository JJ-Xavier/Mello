// Modal do card (Card.dc.html, 1160 × 804 px; com capa, NovoCardCapaAnexos.dc.html, 836 px). Abre
// por cima da tela atual quando o endereço tem ?card=<id>, então o mesmo modal serve ao quadro e
// ao calendário (CAL-11).
// Coluna da esquerda: lista, ✓, título, o aviso de repetição pulada (REP-08), Adicionar,
// Checklist, Anexo, Repetir (Repeticao.dc.html), etiquetas, prioridade, data de entrega,
// repetição, última movimentação, anexos, descrição e checklists. Campos vazios não aparecem: o
// "Adicionar" inclui (decidido em 23/10/2026). Coluna da direita: nota e atividade. A capa é a
// faixa do topo. Arquivos soltos em qualquer parte do modal são anexados.
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type FormEvent
} from 'react'
import { useSearchParams } from 'react-router'
import type { CardDetail, UpdateCardInput } from '../../../../shared/ipc/cards'
import { CHECKLIST_TITLE_MAX } from '../../../../shared/limits'
import { dueStatus } from '../../../../shared/rules/dates'
import { isFinished } from '../../../../shared/rules/finished'
import { priorityLevel } from '../../../../shared/rules/priority'
import { recurrenceSummary } from '../../../../shared/rules/recurrence'
import { Cover } from '../../components/Cover'
import { DoneMark } from '../../components/DoneMark'
import { EditableTitle } from '../../components/EditableTitle'
import { Icon } from '../../components/Icon'
import { Popover, PopoverHeader } from '../../components/Popover'
import { PriorityIcon } from '../../components/PriorityIcon'
import ui from '../../components/ui.module.css'
import { ApiError, api, unwrap } from '../../lib/api'
import { cx } from '../../lib/cx'
import { formatDateTime, formatDue } from '../../lib/format'
import { useAction, useBoard, useCard, useLabels } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import { useNow } from '../../lib/useNow'
import { RepeatDialog } from '../recurrence/RepeatDialog'
import { SkipNotice } from '../recurrence/SkipNotice'
import { Activity } from './Activity'
import { AgingStatus } from './AgingStatus'
import { Attachments } from './Attachments'
import { CardMenu } from './CardMenu'
import styles from './CardModal.module.css'
import { Checklists } from './Checklists'
import { CoverPicker } from './CoverPicker'
import { DatePicker, StatusTag } from './DatePicker'
import { Description } from './Description'
import { LabelChip, LabelPicker } from './LabelPicker'
import { Note } from './Note'
import { PriorityPicker } from './PriorityPicker'
import { useAttach } from './useAttach'
import { useCardAction } from './useCardAction'
import { useDeleteCard } from './useDeleteCard'

// Seletor de lista no topo do modal: leva o card para o fim da lista escolhida (CAR-06).
function ListPicker({ card, close }: { card: CardDetail; close: () => void }) {
  const { data: board } = useBoard(card.boardId)
  const act = useCardAction(card)
  const choose = (listId: string) => {
    close()
    if (listId === card.listId && card.archivedAt === null) return
    const target = board?.lists.find((l) => l.id === listId)
    const index = target?.cards.filter((c) => c.id !== card.id).length ?? 0
    void act(() => unwrap(api().cards.move({ cardId: card.id, listId, index })))
  }
  return (
    <>
      <PopoverHeader title="Mover para a lista" onClose={close} />
      {(board?.lists ?? []).map((l) => (
        <button
          key={l.id}
          type="button"
          className={cx(ui.mi, l.id === card.listId && styles.selected)}
          aria-current={l.id === card.listId ? 'true' : undefined}
          onClick={() => choose(l.id)}
        >
          <span className={styles.grow}>{l.title}</span>
          {l.id === card.listId && (
            <span className={styles.selectedMark}>
              <Icon name="check" />
            </span>
          )}
        </button>
      ))}
    </>
  )
}

function AddChecklist({ card, close }: { card: CardDetail; close: () => void }) {
  const [title, setTitle] = useState('Checklist')
  const act = useCardAction(card)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    close()
    void act(() => unwrap(api().checklists.create({ cardId: card.id, title: title.trim() })))
  }
  return (
    <form className={styles.stack} style={{ gap: 10 }} onSubmit={submit}>
      <PopoverHeader title="Adicionar checklist" onClose={close} />
      <label className={ui.label}>
        Título
        <input
          className={ui.fld}
          value={title}
          maxLength={CHECKLIST_TITLE_MAX}
          autoFocus
          onFocus={(event) => event.target.select()}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <button type="submit" className={cx(ui.pri, styles.start)} disabled={!title.trim()}>
        Adicionar
      </button>
    </form>
  )
}

type Field = 'labels' | 'priority' | 'due'

// O mesmo seletor serve ao "Adicionar" (com voltar) e ao campo já preenchido.
function FieldPicker({
  card,
  field,
  close,
  onBack
}: {
  card: CardDetail
  field: Field
  close: () => void
  onBack?: () => void
}) {
  const act = useCardAction(card)
  const update = (changes: UpdateCardInput) => void act(() => unwrap(api().cards.update(changes)))
  if (field === 'labels') {
    return (
      <LabelPicker
        boardId={card.boardId}
        selected={card.labelIds}
        onChange={(labelIds) =>
          void act(() => unwrap(api().cards.setLabels({ cardId: card.id, labelIds })))
        }
        close={close}
        onBack={onBack}
      />
    )
  }
  if (field === 'priority') {
    return (
      <PriorityPicker
        value={card.priority}
        onPick={(priority) => update({ cardId: card.id, priority })}
        close={close}
        onBack={onBack}
      />
    )
  }
  return (
    <DatePicker
      dueAt={card.dueAt}
      reminder={card.reminder}
      finished={isFinished(card.isDone, card)}
      onSave={(due) => update({ cardId: card.id, due })}
      close={close}
      onBack={onBack}
    />
  )
}

function AddMenu({ card, close }: { card: CardDetail; close: () => void }) {
  const [field, setField] = useState<Field | null>(null)
  if (field) {
    return <FieldPicker card={card} field={field} close={close} onBack={() => setField(null)} />
  }
  return (
    <>
      <PopoverHeader title="Adicionar ao card" onClose={close} />
      <button type="button" className={ui.mi} onClick={() => setField('labels')}>
        <Icon name="tag" />
        Etiquetas
      </button>
      <button type="button" className={ui.mi} onClick={() => setField('priority')}>
        <Icon name="flag" />
        Prioridade
      </button>
      <button type="button" className={ui.mi} onClick={() => setField('due')}>
        <Icon name="clock" />
        Data de entrega
      </button>
    </>
  )
}

function Fields({ card, now }: { card: CardDetail; now: number }) {
  const labelsId = useId()
  const priorityId = useId()
  const dueId = useId()
  const repeatId = useId()
  const { data: labels = [] } = useLabels(card.boardId)
  const chosen = labels.filter((l) => card.labelIds.includes(l.id))
  const priority = priorityLevel(card.priority)
  const status = card.dueAt !== null && dueStatus(card.dueAt, isFinished(card.isDone, card), now)

  return (
    <div className={styles.fields}>
      {chosen.length > 0 && (
        <div>
          <p className={styles.lab}>Etiquetas</p>
          <div className={styles.labelChips}>
            {chosen.map((l) => (
              <button
                key={l.id}
                type="button"
                className={styles.chipButton}
                popoverTarget={labelsId}
              >
                <LabelChip label={l} className={styles.modalLabel} />
              </button>
            ))}
            <button
              type="button"
              className={styles.addLabel}
              aria-label="Adicionar etiqueta"
              popoverTarget={labelsId}
            >
              <Icon name="plus" />
            </button>
          </div>
          <Popover id={labelsId} label="Etiquetas">
            {(close) => <FieldPicker card={card} field="labels" close={close} />}
          </Popover>
        </div>
      )}
      {priority && (
        <div>
          <p className={styles.lab}>Prioridade</p>
          <button type="button" className={styles.outline} popoverTarget={priorityId}>
            <PriorityIcon value={priority.value} />
            {priority.name}
            <Icon name="chevronDown" />
          </button>
          <Popover id={priorityId} label="Prioridade">
            {(close) => <FieldPicker card={card} field="priority" close={close} />}
          </Popover>
        </div>
      )}
      {card.dueAt && (
        <div>
          <p className={styles.lab}>Data de entrega</p>
          <button
            type="button"
            className={cx(styles.outline, styles.dueButton)}
            popoverTarget={dueId}
          >
            {formatDue(card.dueAt)}
            {status && <StatusTag status={status} />}
            <Icon name="chevronDown" />
          </button>
          <Popover id={dueId} label="Datas">
            {(close) => <FieldPicker card={card} field="due" close={close} />}
          </Popover>
        </div>
      )}
      {card.recurrence && (
        <div>
          <p className={styles.lab}>Repetição</p>
          <button
            type="button"
            className={cx(styles.outline, styles.strong)}
            popoverTarget={repeatId}
          >
            <Icon name="repeat" />
            {recurrenceSummary(card.recurrence)}
            {card.recurrence.paused && (
              <span className={styles.pausedTag} title="A lista de destino não está ativa">
                Pausada
              </span>
            )}
            {!card.recurrence.paused && card.recurrence.next === null && (
              <span className={styles.pausedTag}>Terminou</span>
            )}
          </button>
          <Popover id={repeatId} label="Repetir card" width={400}>
            {(close) => <RepeatDialog card={card} close={close} />}
          </Popover>
        </div>
      )}
      <div>
        <p className={styles.lab}>Última movimentação</p>
        <div className={styles.lastMove}>
          {formatDateTime(card.lastActivityAt)}
          <AgingStatus card={card} now={now} />
        </div>
      </div>
    </div>
  )
}

// Card arquivado: o modal continua aberto, com o aviso (decidido em 23/10/2026).
function ArchivedBanner({ card, onDeleted }: { card: CardDetail; onDeleted: () => void }) {
  const run = useAction()
  const remove = useDeleteCard(card, onDeleted)
  return (
    <div role="status" className={styles.archived}>
      <Icon name="archive" size={20} />
      <span className={styles.grow}>Este card está arquivado.</span>
      <button
        type="button"
        className={styles.bannerPrimary}
        onClick={() =>
          run(
            () => unwrap(api().cards.restore({ cardId: card.id })),
            [
              queryKeys.card(card.id),
              queryKeys.board(card.boardId),
              queryKeys.archived(card.boardId)
            ]
          )
        }
      >
        Restaurar
      </button>
      <button type="button" className={styles.bannerSecondary} onClick={() => void remove()}>
        Excluir
      </button>
    </div>
  )
}

const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files')

function CardContent({ card, onDeleted }: { card: CardDetail; onDeleted: () => void }) {
  const listId = useId()
  const coverId = useId()
  const menuId = useId()
  const addId = useId()
  const checklistId = useId()
  const repeatId = useId()
  const now = useNow()
  const act = useCardAction(card)
  const attach = useAttach(card)
  const [dropping, setDropping] = useState(false)
  // O diálogo "Repetir card" aberto: o botão fica destacado (Repeticao.dc.html).
  const [repeating, setRepeating] = useState(false)
  const finished = isFinished(card.isDone, card)

  // Soltar arquivos do Explorer em qualquer parte do modal anexa (ANX-01). Na fase de captura,
  // para o editor de texto não receber o arquivo.
  const drag = {
    onDragOverCapture: (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      setDropping(true)
    },
    onDragLeave: (event: DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false)
    },
    onDropCapture: (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      event.stopPropagation()
      setDropping(false)
      void attach.drop(Array.from(event.dataTransfer.files))
    }
  }

  return (
    <div className={styles.content} {...drag}>
      {card.cover && <Cover cover={card.cover} height={96} />}
      <div className={styles.top}>
        <button type="button" className={styles.list} popoverTarget={listId}>
          {card.listTitle}
          <Icon name="chevronDown" />
        </button>
        <Popover id={listId} label="Mover para a lista">
          {(close) => <ListPicker card={card} close={close} />}
        </Popover>
        <div className={styles.spacer} />
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Capa do card"
          popoverTarget={coverId}
        >
          <Icon name="image" size={20} />
        </button>
        <Popover id={coverId} label="Capa" placement="belowEnd">
          {(close) => <CoverPicker card={card} close={close} />}
        </Popover>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Mais ações"
          popoverTarget={menuId}
        >
          <Icon name="dots" size={20} />
        </button>
        <Popover id={menuId} label="Ações do card" placement="belowEnd">
          {(close) => <CardMenu card={card} close={close} onDeleted={onDeleted} />}
        </Popover>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Fechar"
          onClick={(event) => event.currentTarget.closest('dialog')?.close()}
        >
          <Icon name="close" size={20} />
        </button>
      </div>
      <div className={styles.columns}>
        <div className={styles.body}>
          {card.archivedAt !== null && <ArchivedBanner card={card} onDeleted={onDeleted} />}
          <div className={styles.titleRow}>
            <button
              type="button"
              className={styles.doneButton}
              aria-label={
                card.isDone ? 'Marcar card como não concluído' : 'Marcar card como concluído'
              }
              aria-pressed={card.isDone}
              onClick={() =>
                act(() => unwrap(api().cards.update({ cardId: card.id, isDone: !card.isDone })))
              }
            >
              <DoneMark done={card.isDone} size={26} />
            </button>
            <EditableTitle
              as="h1"
              value={card.title}
              maxLength={500}
              label="Título do card"
              onSave={(title) => act(() => unwrap(api().cards.update({ cardId: card.id, title })))}
              className={cx(styles.title, finished && styles.titleFinished)}
              buttonClassName={styles.titleButton}
              inputClassName={styles.titleInput}
            />
          </div>
          {card.skipNotice && (
            <div className={styles.indented}>
              <SkipNotice card={card} notice={card.skipNotice} />
            </div>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.outline} popoverTarget={addId}>
              <Icon name="plus" />
              Adicionar
            </button>
            <Popover id={addId} label="Adicionar ao card">
              {(close) => <AddMenu card={card} close={close} />}
            </Popover>
            <button type="button" className={styles.outline} popoverTarget={checklistId}>
              <Icon name="checklist" />
              Checklist
            </button>
            <Popover id={checklistId} label="Adicionar checklist">
              {(close) => <AddChecklist card={card} close={close} />}
            </Popover>
            <button
              type="button"
              className={styles.outline}
              title="Escolha ou solte arquivos no card"
              onClick={() => void attach.choose()}
            >
              <Icon name="attachment" />
              Anexo
            </button>
            <button
              type="button"
              className={cx(styles.outline, repeating && styles.outlineOpen)}
              aria-expanded={repeating}
              popoverTarget={repeatId}
            >
              <Icon name="repeat" />
              Repetir
            </button>
            <Popover id={repeatId} label="Repetir card" width={400} onToggle={setRepeating}>
              {(close) => <RepeatDialog card={card} close={close} />}
            </Popover>
          </div>
          <Fields card={card} now={now} />
          <Attachments card={card} attach={attach} />
          <Description card={card} />
          <Checklists card={card} now={now} />
        </div>
        <aside className={styles.aside} aria-label="Nota e atividade">
          <Note key={card.id} card={card} />
          <Activity entries={card.activity} />
        </aside>
      </div>
      {dropping && (
        <div className={styles.dropZone} aria-hidden="true">
          <Icon name="attachment" size={24} />
          Solte para anexar ao card
        </div>
      )}
    </div>
  )
}

function CardDialog({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const { data: card, error } = useCard(cardId)
  const gone = error instanceof ApiError && error.code === 'NOT_FOUND'

  // Modal de verdade (foco preso, Esc fecha) e fechamento leve: clicar fora também fecha. Com um
  // popover do modal aberto, o primeiro clique fora fecha só o popover.
  const popoverWasOpen = useRef(false)
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    element.setAttribute('closedby', 'any')
    if (!element.open) element.showModal()
    const onPointerDown = () => {
      popoverWasOpen.current = element.querySelector(':popover-open') !== null
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [])

  // Card que não existe mais (excluído): o endereço volta para a tela de baixo.
  useEffect(() => {
    if (gone) onClose()
  }, [gone, onClose])

  return (
    <dialog
      ref={dialog}
      aria-label={card ? card.title : 'Card'}
      className={cx(styles.modal, card?.cover && styles.withCover)}
      onClose={onClose}
      onCancel={(event) => {
        if (popoverWasOpen.current) event.preventDefault()
        popoverWasOpen.current = false
      }}
    >
      {card && <CardContent card={card} onDeleted={() => dialog.current?.close()} />}
    </dialog>
  )
}

export function CardModal() {
  const [params, setParams] = useSearchParams()
  const cardId = params.get('card')

  // Fechar tira o ?card= do endereço sem criar um passo a mais no histórico.
  const close = useCallback(
    () =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.delete('card')
          return next
        },
        { replace: true }
      ),
    [setParams]
  )

  if (!cardId) return null
  return <CardDialog key={cardId} cardId={cardId} onClose={close} />
}
