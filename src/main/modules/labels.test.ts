import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createLabelInput, updateLabelInput } from '../../shared/ipc/labels'
import { createTestDb, insertCard } from '../db/test-db'
import { card, cardLabel } from '../db/schema'
import * as boards from './boards'
import * as labels from './labels'

const NOW = 1_800_000_000_000

let t: ReturnType<typeof createTestDb>
let boardId: string

beforeEach(() => {
  t = createTestDb()
  boardId = boards.create(t.db, 'Casa', NOW).id
})

describe('etiquetas (ETQ)', () => {
  it('ETQ-01: cor da paleta obrigatória, nome opcional (vazio = sem nome) de até 40', () => {
    const base = { boardId: randomUUID(), color: '#6e5dc6' }
    expect(createLabelInput.parse({ ...base, name: '  ' }).name).toBeNull()
    expect(createLabelInput.parse({ ...base, name: ' Casa ' }).name).toBe('Casa')
    expect(createLabelInput.safeParse({ ...base, name: 'x'.repeat(41) }).success).toBe(false)
    expect(createLabelInput.safeParse({ ...base, name: '', color: '#123456' }).success).toBe(false)
    expect(updateLabelInput.parse({ labelId: randomUUID(), name: '' }).name).toBeNull()
  })

  it('lista as 6 do quadro em ordem; a nova vai para o fim', () => {
    expect(labels.list(t.db, boardId).map((l) => l.color)).toEqual([
      '#6e5dc6',
      '#c9372c',
      '#b65c02',
      '#e2b203',
      '#8c9bab',
      '#216e4e'
    ])
    const created = labels.create(t.db, { boardId, name: 'Urgente', color: '#1f5eff' })
    expect(labels.list(t.db, boardId).at(-1)).toEqual(created)
    expect(() => labels.list(t.db, randomUUID())).toThrow(/não encontrado/)
  })

  it('editar nome e cor não mexe nos cards (ENV-06)', () => {
    const roxo = labels.list(t.db, boardId)[0]!
    const todo = boards.get(t.db, boardId).lists[0]!.id
    const id = insertCard(t.db, todo, { labelIds: [roxo.id] })
    const before = t.db.select().from(card).where(eq(card.id, id)).get()
    expect(labels.update(t.db, { labelId: roxo.id, name: 'Pessoal', color: '#206a83' })).toEqual({
      ...roxo,
      name: 'Pessoal',
      color: '#206a83'
    })
    expect(t.db.select().from(card).where(eq(card.id, id)).get()).toEqual(before)
  })

  it('ETQ-04: excluir tira a etiqueta de todos os cards', () => {
    const roxo = labels.list(t.db, boardId)[0]!
    const todo = boards.get(t.db, boardId).lists[0]!.id
    const a = insertCard(t.db, todo, { labelIds: [roxo.id] })
    insertCard(t.db, todo, { labelIds: [roxo.id] })
    labels.remove(t.db, roxo.id)
    expect(labels.list(t.db, boardId)).toHaveLength(5)
    expect(t.db.select().from(cardLabel).all()).toEqual([])
    expect(t.db.select().from(card).where(eq(card.id, a)).get()!.lastActivityAt).toBe(1000)
    expect(() => labels.remove(t.db, roxo.id)).toThrow(/não encontrada/)
  })
})
