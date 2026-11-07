// Atividade do card (ATV) e o "zerar o envelhecimento" (ENV-05). Ficam aqui, num módulo só,
// porque cards, checklists e, nas próximas etapas, anexos, capa e repetição usam os dois.
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { DbOrTx } from '../db/client'
import { activity, card } from '../db/schema'

type ActivityKind = (typeof activity.$inferInsert)['kind']

export function addActivity(
  tx: DbOrTx,
  cardId: string,
  kind: ActivityKind,
  data: Record<string, unknown>,
  now: number
): void {
  tx.insert(activity)
    .values({ id: randomUUID(), cardId, kind, data: JSON.stringify(data), createdAt: now })
    .run()
}

// Zera o envelhecimento (ENV-05): a última alteração do card passa a ser agora.
export function touch(tx: DbOrTx, cardId: string, now: number): void {
  tx.update(card).set({ lastActivityAt: now, updatedAt: now }).where(eq(card.id, cardId)).run()
}
