// Editor de etiquetas (Estados.dc.html): buscar, marcar e desmarcar no card, editar nome e cor,
// criar e excluir (ETQ-04). As etiquetas são do quadro (ETQ-01).
import { useState, type FormEvent } from 'react'
import type { Label } from '../../../../shared/ipc/labels'
import { LABEL_NAME_MAX } from '../../../../shared/limits'
import { colorName, LABEL_COLORS, textOn } from '../../../../shared/rules/color'
import { removeAccents } from '../../../../shared/text'
import { Icon } from '../../components/Icon'
import { PopoverHeader } from '../../components/Popover'
import ui from '../../components/ui.module.css'
import { useConfirm } from '../../components/useConfirm'
import { api, unwrap } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useAction, useLabels } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import styles from './CardModal.module.css'

const plain = (text: string) => removeAccents(text).toLowerCase()

export function LabelChip({ label, className }: { label: Label; className?: string }) {
  return (
    <span
      className={cx(styles.labelChip, className)}
      style={{ background: label.color, color: textOn(label.color) }}
    >
      {label.name}
    </span>
  )
}

function LabelForm({
  boardId,
  label,
  close,
  onBack,
  onDone
}: {
  boardId: string
  label: Label | null
  close: () => void
  onBack: () => void
  onDone: () => void
}) {
  const [name, setName] = useState(label?.name ?? '')
  const [color, setColor] = useState<string>(label?.color ?? LABEL_COLORS[0].value)
  const run = useAction()
  const confirm = useConfirm()
  const keys = [queryKeys.labels(boardId), queryKeys.board(boardId), ['card']]

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const task = label
      ? () => unwrap(api().labels.update({ labelId: label.id, name, color }))
      : () => unwrap(api().labels.create({ boardId, name, color }))
    await run(task, keys)
    onDone()
  }

  const remove = async () => {
    if (!label) return
    const ok = await confirm({
      title: 'Excluir etiqueta?',
      message: 'Ela sai de todos os cards deste quadro.',
      confirmLabel: 'Excluir'
    })
    if (!ok) return
    await run(() => unwrap(api().labels.delete({ labelId: label.id })), keys)
    onDone()
  }

  return (
    <form className={styles.stack} style={{ gap: 10 }} onSubmit={save}>
      <PopoverHeader
        title={label ? 'Editar etiqueta' : 'Criar etiqueta'}
        onClose={close}
        onBack={onBack}
      />
      <div className={styles.labelPreview}>
        <LabelChip label={{ id: '', boardId, name: name.trim() || null, color }} />
      </div>
      <label className={ui.label}>
        Nome
        <input
          className={ui.fld}
          value={name}
          maxLength={LABEL_NAME_MAX}
          placeholder="Sem nome"
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <p className={ui.cap}>COR</p>
      <div className={styles.colors}>
        {LABEL_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            className={styles.color}
            style={{ background: c.value }}
            aria-label={`Cor ${c.name}`}
            aria-pressed={c.value === color}
            onClick={() => setColor(c.value)}
          />
        ))}
      </div>
      <div className={styles.buttonRow}>
        <button type="submit" className={ui.pri}>
          {label ? 'Salvar' : 'Criar'}
        </button>
        {label && (
          <button type="button" className={cx(ui.lnk, ui.danger)} onClick={remove}>
            Excluir
          </button>
        )}
      </div>
    </form>
  )
}

export function LabelPicker({
  boardId,
  selected,
  onChange,
  close,
  onBack
}: {
  boardId: string
  selected: string[]
  onChange: (labelIds: string[]) => void
  close: () => void
  onBack?: () => void
}) {
  const { data: labels = [] } = useLabels(boardId)
  const [view, setView] = useState<{ edit: Label | null } | null>(null)
  const [search, setSearch] = useState('')

  if (view) {
    return (
      <LabelForm
        boardId={boardId}
        label={view.edit}
        close={close}
        onBack={() => setView(null)}
        onDone={() => setView(null)}
      />
    )
  }

  const query = plain(search.trim())
  const shown = labels.filter(
    (l) =>
      !query || plain(l.name ?? '').includes(query) || plain(colorName(l.color)).includes(query)
  )

  // A ordem gravada é a do quadro.
  const toggle = (labelId: string, on: boolean) => {
    const next = labels
      .map((l) => l.id)
      .filter((id) => (id === labelId ? on : selected.includes(id)))
    onChange(next)
  }

  return (
    <>
      <PopoverHeader title="Etiquetas" onClose={close} onBack={onBack} />
      <input
        className={ui.fld}
        placeholder="Buscar etiquetas..."
        aria-label="Buscar etiquetas"
        value={search}
        autoFocus
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className={styles.stack} style={{ gap: 8, marginTop: 4 }}>
        {shown.map((l) => (
          <div key={l.id} className={styles.labelRow}>
            <input
              type="checkbox"
              className={ui.check}
              checked={selected.includes(l.id)}
              aria-label={`Etiqueta ${l.name ?? colorName(l.color)}`}
              onChange={(event) => toggle(l.id, event.target.checked)}
            />
            <LabelChip label={l} className={styles.grow} />
            <button
              type="button"
              className={styles.smallIcon}
              aria-label={`Editar etiqueta ${l.name ?? colorName(l.color)}`}
              onClick={() => setView({ edit: l })}
            >
              <Icon name="edit" />
            </button>
          </div>
        ))}
        {shown.length === 0 && <p className={ui.note}>Nenhuma etiqueta encontrada.</p>}
      </div>
      <button
        type="button"
        className={ui.sec}
        style={{ marginTop: 4 }}
        onClick={() => setView({ edit: null })}
      >
        Criar uma nova etiqueta
      </button>
    </>
  )
}
