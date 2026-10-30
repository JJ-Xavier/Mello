// Etapa 12: desempenho com 500 cards num quadro (PLANO.md, riscos). O tempo medido aparece no
// terminal; o limite é folgado, para o teste não falhar só porque a máquina está ocupada.
import { performance } from 'node:perf_hooks'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, insertCard } from '../db/test-db'
import { label } from '../db/schema'
import * as boards from './boards'
import { search } from './search'

const LIMIT_MS = 2000

let t: ReturnType<typeof createTestDb>
let boardId: string

beforeEach(() => {
  t = createTestDb()
  boardId = boards.create(t.db, 'Casa', 1000).id
  const lists = boards.get(t.db, boardId).lists
  const labels = t.db.select().from(label).where(eq(label.boardId, boardId)).all()
  for (let i = 0; i < 500; i++) {
    insertCard(t.db, lists[i % lists.length]!.id, {
      title: `Card ${i + 1}`,
      position: `a${String(i).padStart(3, '0')}`,
      labelIds: [labels[i % labels.length]!.id],
      checklist: {
        title: 'Itens',
        items: [
          { text: `Tarefa ${i + 1}`, isDone: i % 2 === 0 },
          { text: 'Outra', isDone: false }
        ]
      }
    })
  }
})

function timed<T>(name: string, task: () => T): T {
  const started = performance.now()
  const result = task()
  const ms = performance.now() - started
  console.log(`${name}: ${ms.toFixed(0)} ms`)
  expect(ms).toBeLessThan(LIMIT_MS)
  return result
}

describe('desempenho com 500 cards (etapa 12)', () => {
  it('abrir o quadro traz os 500 cards com etiquetas e checklists', () => {
    const detail = timed('boards:get com 500 cards', () => boards.get(t.db, boardId))
    expect(detail.lists.flatMap((l) => l.cards)).toHaveLength(500)
    expect(detail.lists[0]!.cards[0]).toMatchObject({ checkTotal: 2, labels: [expect.anything()] })
  })

  it('a busca percorre os 500 cards e os 1000 itens', () => {
    const found = timed('search:query em 500 cards', () => search(t.db, 'tarefa'))
    expect(found.tasks).toHaveLength(8)
  })
})
