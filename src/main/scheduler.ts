// Agendador: roda ao abrir o app e a cada minuto, também com a janela escondida na bandeja
// (REP-11, LEM-07). Cada rodada processa as repetições que venceram (modules/recurrence.ts) e
// dispara os lembretes (modules/reminders.ts). Não importa o Electron: a notificação chega por
// Notifier, e os testes passam um falso.
import type { MissedReminder } from '../shared/ipc/recurrence'
import { reminderNotification } from '../shared/rules/reminders'
import type { Clock } from './clock'
import type { Db } from './db/client'
import * as recurrence from './modules/recurrence'
import * as reminders from './modules/reminders'

export const TICK_MS = 60_000

// LEM-03: a notificação do Windows. Clicar abre o app no card.
export interface Notifier {
  notify(notification: { title: string; body: string; cardId: string; boardId: string }): void
}

export interface Scheduler {
  start(): void
  stop(): void
  // Uma rodada agora (o relógio de teste chama ao mudar).
  tick(): void
  // LEM-06: os lembretes que venceram com o app fechado, para o aviso agrupado. Vêm uma vez só.
  takeMissed(): MissedReminder[]
}

export function createScheduler(options: {
  db: Db
  clock: Clock
  notifier: Notifier
  // O agendador mudou dados: a tela recarrega (evento data:changed).
  onChange: () => void
  onError?: (error: unknown) => void
}): Scheduler {
  const { db, clock, notifier, onChange, onError } = options
  let missed: MissedReminder[] = []
  let timer: ReturnType<typeof setInterval> | null = null

  // A primeira rodada é a da abertura: os lembretes vencidos foram perdidos com o app fechado e
  // viram o aviso agrupado, sem uma notificação para cada um (LEM-06).
  function run(opening: boolean): void {
    const now = clock.now()
    try {
      if (recurrence.processDue(db, now)) onChange()
    } catch (error) {
      onError?.(error)
    }
    try {
      const due = reminders.takeDue(db, now)
      if (opening) {
        missed = [...missed, ...due]
        return
      }
      for (const reminder of due) {
        notifier.notify({
          ...reminderNotification(reminder, now),
          cardId: reminder.cardId,
          boardId: reminder.boardId
        })
      }
    } catch (error) {
      onError?.(error)
    }
  }

  return {
    start() {
      run(true)
      timer = setInterval(() => run(false), TICK_MS)
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = null
    },
    tick: () => run(false),
    takeMissed() {
      const taken = missed
      missed = []
      return taken
    }
  }
}
