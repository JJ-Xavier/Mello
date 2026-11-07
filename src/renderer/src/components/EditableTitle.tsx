// Título que vira campo ao clicar: Enter ou clicar fora salva, Esc cancela. Um título vazio ou
// igual ao anterior não é salvo. O campo não deixa o arrastar da lista começar por ele.
// buttonProps põe o arrastar no próprio título (checklists e itens): espaço pega, Enter edita.
import { useState, type ButtonHTMLAttributes, type ElementType, type KeyboardEvent } from 'react'

interface EditableTitleProps {
  value: string
  maxLength: number
  label: string
  onSave: (title: string) => void
  as?: ElementType
  className?: string
  buttonClassName?: string
  inputClassName?: string
  buttonProps?: ButtonHTMLAttributes<HTMLButtonElement>
}

export function EditableTitle({
  value,
  maxLength,
  label,
  onSave,
  as: Tag = 'h2',
  className,
  buttonClassName,
  inputClassName,
  buttonProps
}: EditableTitleProps) {
  const [draft, setDraft] = useState<string | null>(null)

  const finish = (save: boolean) => {
    const title = draft?.trim() ?? ''
    setDraft(null)
    if (save && title && title !== value) onSave(title)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.key === 'Enter') finish(true)
    if (event.key === 'Escape') {
      // Dentro do modal do card, Esc cancela só a edição (sem fechar o modal).
      event.preventDefault()
      finish(false)
    }
  }

  if (draft !== null) {
    return (
      <input
        className={inputClassName}
        value={draft}
        maxLength={maxLength}
        aria-label={label}
        autoFocus
        onFocus={(event) => event.target.select()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => event.stopPropagation()}
      />
    )
  }

  return (
    <Tag className={className}>
      <button
        type="button"
        title="Clique para renomear"
        {...buttonProps}
        className={buttonClassName}
        onClick={() => setDraft(value)}
        onKeyDown={(event) => {
          // Dentro de um cabeçalho arrastável (a lista), as teclas do título não chegam a ele. Quando
          // o próprio título é a alça (buttonProps), elas seguem: o arraste ouve o documento.
          if (buttonProps) buttonProps.onKeyDown?.(event)
          else event.stopPropagation()
        }}
      >
        {value}
      </button>
    </Tag>
  )
}
