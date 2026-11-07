// Aviso de erro no canto da tela, no visual dos popovers. Some sozinho depois de alguns segundos.
// O protótipo não tem esse estado; ele só aparece quando uma operação falha.
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { NotifyContext, type Notify } from './useNotify'

const VISIBLE_MS = 6000

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const notify = useCallback<Notify>((next) => {
    window.clearTimeout(timer.current)
    setMessage(next)
    timer.current = window.setTimeout(() => setMessage(null), VISIBLE_MS)
  }, [])

  return (
    <NotifyContext.Provider value={notify}>
      {children}
      {message && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            left: 16,
            bottom: 16,
            zIndex: 20,
            maxWidth: 360,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 10,
            background: 'var(--pop)',
            border: '1px solid var(--line)',
            boxShadow: 'var(--shadow-pop)',
            color: 'var(--strong)',
            fontSize: 14,
            lineHeight: '20px'
          }}
        >
          <span style={{ flex: 1 }}>{message}</span>
          <button
            type="button"
            aria-label="Fechar aviso"
            onClick={() => setMessage(null)}
            style={{ border: 0, background: 'transparent', color: 'var(--muted)', padding: 2 }}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
    </NotifyContext.Provider>
  )
}
