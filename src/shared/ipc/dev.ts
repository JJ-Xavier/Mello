// Relógio de teste do modo de desenvolvimento (decidido em 24/10/2026): o main e a tela somam o
// mesmo adiantamento ao relógio do Windows, para conferir o envelhecimento (e, na etapa 8, a
// repetição e os lembretes) sem esperar dias. O app instalado recusa mudar o relógio.
import { z } from 'zod'

export const HOUR_MS = 3_600_000
// Até 10 anos à frente. O relógio nunca fica atrás do real.
export const CLOCK_OFFSET_MAX = 3650 * 24 * HOUR_MS

export const setClockInput = z.object({
  offset: z.number().int().min(0).max(CLOCK_OFFSET_MAX)
})

export type SetClockInput = z.infer<typeof setClockInput>

export interface DevClock {
  // Milissegundos à frente do relógio do Windows.
  offset: number
}
