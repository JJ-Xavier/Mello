// Nível de envelhecimento do card (ENV-01 a ENV-04; PLANO.md, seção 6.1). A tela calcula o nível
// com o "agora" dela, então ele muda sozinho com o tempo, sem precisar de uma alteração (ENV-10).
import { isFinished, type DoneListFlag } from './finished'

export const DAY_MS = 86_400_000
export const AGING_LEVELS = 5

// Por que o card não envelhece (ENV-03): desligado nas Configurações, lista com "Não envelhece",
// finalizado (FIN-01) ou modelo (MOD-02).
export type FrozenReason = 'disabled' | 'list' | 'finished' | 'template'

export interface AgingCard {
  lastActivityAt: number
  isDone: boolean
  isTemplate: boolean
}

export interface AgingList extends DoneListFlag {
  freezesAging: boolean
}

export interface Aging {
  level: number
  // Dias inteiros desde a última alteração (ENV-01). Um relógio atrás da alteração conta 0.
  days: number
  frozen: FrozenReason | null
}

// ENV-02: 0–2 dias → 0, 3–5 → 1, 6–8 → 2, 9–11 → 3, 12–13 → 4, 14 ou mais → 5.
export function levelForDays(days: number): number {
  if (days < 3) return 0
  if (days < 6) return 1
  if (days < 9) return 2
  if (days < 12) return 3
  if (days < 14) return 4
  return 5
}

function frozenReason(card: AgingCard, list: AgingList, enabled: boolean): FrozenReason | null {
  if (!enabled) return 'disabled'
  if (list.freezesAging) return 'list'
  if (isFinished(card.isDone, list)) return 'finished'
  if (card.isTemplate) return 'template'
  return null
}

// Congelar não zera o tempo (ENV-04): os dias continuam contando; só o nível fica em 0.
export function agingOf(card: AgingCard, list: AgingList, enabled: boolean, now: number): Aging {
  const days = Math.max(0, Math.floor((now - card.lastActivityAt) / DAY_MS))
  const frozen = frozenReason(card, list, enabled)
  return { level: frozen ? 0 : levelForDays(days), days, frozen }
}
