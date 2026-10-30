// Popover nativo (atributo popover="auto"): o navegador cuida da camada de cima, do Esc e do
// clique fora. Quem abre é um botão com popoverTarget={id}, que também vira a âncora do
// posicionamento. O conteúdo só é montado enquanto o popover está aberto, então formulários e
// submenus recomeçam do zero a cada abertura.
import { useEffect, useState, type ReactNode } from 'react'
import { cx } from '../lib/cx'
import { Icon } from './Icon'
import styles from './Popover.module.css'

export type PopoverPlacement = 'belowStart' | 'belowEnd' | 'above'

interface PopoverProps {
  id: string
  label: string
  placement?: PopoverPlacement
  width?: number
  // Avisa quando abre e fecha (o botão que abriu pode precisar continuar visível).
  onToggle?: (open: boolean) => void
  children: (close: () => void) => ReactNode
}

export function Popover({
  id,
  label,
  placement = 'belowStart',
  width,
  onToggle,
  children
}: PopoverProps) {
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!element) return
    const toggle = (event: Event) => {
      const isOpen = (event as ToggleEvent).newState === 'open'
      setOpen(isOpen)
      onToggle?.(isOpen)
    }
    element.addEventListener('toggle', toggle)
    return () => element.removeEventListener('toggle', toggle)
  }, [element, onToggle])

  const close = () => element?.hidePopover()

  return (
    <div
      ref={setElement}
      id={id}
      popover="auto"
      role="dialog"
      aria-label={label}
      className={cx(styles.pop, placement !== 'belowStart' && styles[placement])}
      style={width ? { width } : undefined}
    >
      {open && children(close)}
    </div>
  )
}

// Cabeçalho centralizado com o X de fechar e, nos submenus, a seta de voltar.
export function PopoverHeader({
  title,
  onClose,
  onBack
}: {
  title: string
  onClose: () => void
  onBack?: () => void
}) {
  return (
    <div className={styles.head}>
      {onBack && (
        <button
          type="button"
          className={cx(styles.headButton, styles.back)}
          aria-label="Voltar"
          onClick={onBack}
        >
          <Icon name="chevronLeft" />
        </button>
      )}
      {title}
      <button
        type="button"
        className={cx(styles.headButton, styles.close)}
        aria-label="Fechar"
        onClick={onClose}
      >
        <Icon name="close" />
      </button>
    </div>
  )
}
