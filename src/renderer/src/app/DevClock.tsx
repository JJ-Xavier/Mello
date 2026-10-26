// Relógio de teste, só no modo de desenvolvimento (decidido em 24/10/2026):
// - Ctrl+Alt+→ adianta 1 dia e Ctrl+Alt+Shift+→ adianta 1 hora;
// - Ctrl+Alt+← e Ctrl+Alt+Shift+← voltam o mesmo tanto, até o relógio real;
// - Ctrl+Alt+0 volta ao relógio real (fora dos campos de texto, onde AltGr+0 escreve "}").
// O main guarda o adiantamento e o usa em tudo o que grava; a tela soma o mesmo (lib/clock.ts).
// Enquanto estiver adiantado, o selo no canto mostra quanto.
import { useEffect, useRef } from 'react'
import { HOUR_MS } from '../../../shared/ipc/dev'
import { DAY_MS } from '../../../shared/rules/aging'
import { useNotify } from '../components/useNotify'
import { api } from '../lib/api'
import { clockOffset, setClockOffset, useClockOffset } from '../lib/clock'
import { useAppInfo } from '../lib/queries'
import styles from './DevClock.module.css'

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches('input, textarea, select'))
  )
}

// O adiantamento depois da tecla, a partir do atual, ou null se ela não é do relógio.
function nextOffset(event: KeyboardEvent, current: number): number | null {
  if (!event.ctrlKey || !event.altKey) return null
  const step = event.shiftKey ? HOUR_MS : DAY_MS
  if (event.code === 'ArrowRight') return current + step
  if (event.code === 'ArrowLeft') return Math.max(0, current - step)
  if ((event.code === 'Digit0' || event.code === 'Numpad0') && !isTyping(event.target)) return 0
  return null
}

function describeOffset(offset: number): string {
  const days = Math.floor(offset / DAY_MS)
  const hours = Math.floor((offset % DAY_MS) / HOUR_MS)
  const parts = [
    days > 0 && (days === 1 ? '1 dia' : `${days} dias`),
    hours > 0 && `${hours} h`
  ].filter(Boolean)
  return `+${parts.join(' e ') || 'menos de 1 h'}`
}

function Controls() {
  const offset = useClockOffset()
  const notify = useNotify()
  // O adiantamento já pedido ao main. A tecla segurada repete mais rápido do que o main responde,
  // então cada tecla parte do último pedido, e não do que a tela já mostra.
  const asked = useRef(clockOffset())

  // A tela pode ter sido recarregada com o main já adiantado.
  useEffect(() => {
    let alive = true
    void api()
      .dev.clock()
      .then((result) => {
        if (!alive || !result.ok) return
        asked.current = result.data.offset
        setClockOffset(result.data.offset)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const next = nextOffset(event, asked.current)
      if (next === null) return
      event.preventDefault()
      event.stopPropagation()
      asked.current = next
      void api()
        .dev.setClock({ offset: next })
        .then((result) => {
          if (result.ok) {
            setClockOffset(result.data.offset)
          } else {
            asked.current = clockOffset()
            notify(result.error.message)
          }
        })
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [notify])

  if (offset === 0) return null
  return (
    <div role="status" className={styles.badge} data-dev-clock="">
      Relógio {describeOffset(offset)}
    </div>
  )
}

export function DevClock() {
  const { data: info } = useAppInfo()
  return info?.dev ? <Controls /> : null
}
