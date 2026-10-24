// Confirmação de ações sem volta (excluir) ou pesadas (anexar arquivo grande). Um <dialog> modal
// só, no topo do app: abrir o modal
// fecha os popovers, então a confirmação não pode morar dentro deles. Os componentes pedem a
// confirmação com useConfirm().
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import styles from './Confirm.module.css'
import ui from './ui.module.css'
import { ConfirmContext, type Confirm, type ConfirmOptions } from './useConfirm'

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const titleId = useId()

  // Clicar fora ou apertar Esc cancela.
  useEffect(() => dialog.current?.setAttribute('closedby', 'any'), [])

  useEffect(() => {
    if (options && !dialog.current?.open) dialog.current?.showModal()
  }, [options])

  const confirm = useCallback<Confirm>(
    (next) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false)
        resolver.current = resolve
        setOptions(next)
      }),
    []
  )

  const finish = (value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    dialog.current?.close()
  }

  const onClose = () => {
    resolver.current?.(false)
    resolver.current = null
    setOptions(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={dialog}
        role="alertdialog"
        aria-labelledby={titleId}
        className={styles.dialog}
        onClose={onClose}
      >
        {options && (
          <>
            <h3 id={titleId} className={styles.title}>
              {options.title}
            </h3>
            <p className={styles.message}>{options.message}</p>
            <div className={styles.actions}>
              <button type="button" className={ui.sec} onClick={() => finish(false)} autoFocus>
                Cancelar
              </button>
              <button
                type="button"
                className={options.tone === 'primary' ? ui.pri : styles.confirm}
                onClick={() => finish(true)}
              >
                {options.confirmLabel}
              </button>
            </div>
          </>
        )}
      </dialog>
    </ConfirmContext.Provider>
  )
}
