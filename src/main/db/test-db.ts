// Banco em memória, já migrado, para os testes dos módulos. Só os testes importam este arquivo.
import { randomUUID } from 'node:crypto'
import { createDb, openSqlite } from './client'
import { applyMigrations, pendingMigrations } from './migrate'
import { card, cardLabel, checklist, checklistItem } from './schema'

export function createTestDb() {
  const sqlite = openSqlite(':memory:')
  applyMigrations(sqlite, pendingMigrations(sqlite), 0)
  return { sqlite, db: createDb(sqlite) }
}

type TestDb = ReturnType<typeof createTestDb>['db']

export function insertCard(
  db: TestDb,
  listId: string,
  options: {
    title?: string
    position?: string
    now?: number
    labelIds?: string[]
    archivedAt?: number | null
    isDone?: boolean
    checklist?: { title: string; items: { text: string; isDone: boolean }[] }
  } = {}
): string {
  const id = randomUUID()
  const now = options.now ?? 1000
  db.insert(card)
    .values({
      id,
      listId,
      title: options.title ?? 'Card',
      position: options.position ?? 'a0',
      isDone: options.isDone ?? false,
      lastActivityAt: now,
      archivedAt: options.archivedAt ?? null,
      createdAt: now,
      updatedAt: now
    })
    .run()
  for (const labelId of options.labelIds ?? []) {
    db.insert(cardLabel).values({ cardId: id, labelId }).run()
  }
  if (options.checklist) {
    const checklistId = randomUUID()
    db.insert(checklist)
      .values({ id: checklistId, cardId: id, title: options.checklist.title, position: 'a0' })
      .run()
    options.checklist.items.forEach((item, i) => {
      db.insert(checklistItem)
        .values({
          id: randomUUID(),
          checklistId,
          text: item.text,
          isDone: item.isDone,
          position: `a${i}`,
          createdAt: now,
          updatedAt: now
        })
        .run()
    })
  }
  return id
}
