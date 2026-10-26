// Relógio da tela: o do Windows mais o adiantamento do relógio de teste, o mesmo do main (só no
// modo de desenvolvimento; decidido em 24/10/2026). Quem precisa de "agora" usa clockNow() ou o
// useNow(), que redesenha quando o adiantamento muda.
import { useSyncExternalStore } from 'react'

let offset = 0
const listeners = new Set<() => void>()

export function clockNow(): number {
  return Date.now() + offset
}

export function clockOffset(): number {
  return offset
}

export function setClockOffset(next: number): void {
  if (next === offset) return
  offset = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useClockOffset(): number {
  return useSyncExternalStore(subscribe, clockOffset)
}
