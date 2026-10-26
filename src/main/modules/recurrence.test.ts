import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { recurrenceRuleInput, type RecurrenceRuleInput } from '../../shared/ipc/recurrence'
import { createTestDb } from '../db/test-db'
import {
  card,
  checklistItem,
  label,
  recurrence as recurrenceTable,
  recurrenceOccurrence
} from '../db/schema'
import * as boards from './boards'
import * as cards from './cards'
import * as checklists from './checklists'
import * as lists from './lists'
import * as recurrence from './recurrence'

// Quarta, 21 de outubro de 2026, 10:00. A repetição semanal de segunda às 08:00 cai em 26/10,
// 02/11, 09/11…
const at = (month: number, day: number, hour = 10, minute = 0) =>
  new Date(2026, month - 1, day, hour, minute).getTime()
const SAVE = at(10, 21)
const SEG = 2

let t: ReturnType<typeof createTestDb>
let boardId: string
let listsOf: Record<string, string>
let compras: string

beforeEach(() => {
  t = createTestDb()
  boardId = boards.create(t.db, 'Casa', at(10, 1)).id
  listsOf = Object.fromEntries(boards.get(t.db, boardId).lists.map((l) => [l.title, l.id]))
  compras = cards.create(t.db, listsOf['A fazer']!, 'Compras', at(10, 1)).id
})

const rule = (changes: Partial<RecurrenceRuleInput> = {}): RecurrenceRuleInput => ({
  freq: 'weekly',
  weekdays: SEG,
  monthDay: null,
  intervalDays: null,
  time: '08:00',
  targetListId: listsOf['A fazer']!,
  copyLabelsPriority: true,
  copyDescription: true,
  copyChecklist: true,
  copyDueDate: false,
  ifPreviousOpen: 'skip',
  endsKind: 'never',
  endsOn: null,
  endsAfter: null,
  ...changes
})

const series = () =>
  t.db
    .select()
    .from(card)
    .where(eq(card.recurrenceId, cards.get(t.db, compras).recurrence!.id))
    .all()
const newest = () => series().sort((a, b) => b.createdAt - a.createdAt)[0]!
const occurrences = () =>
  t.db
    .select()
    .from(recurrenceOccurrence)
    .all()
    .sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate))
const finish = (cardId: string, when = SAVE) =>
  cards.move(t.db, cardId, listsOf['Concluído']!, 0, when)
const face = (cardId: string) =>
  boards
    .get(t.db, boardId)
    .lists.flatMap((l) => l.cards)
    .find((c) => c.id === cardId)!

describe('salvar e remover a repetição', () => {
  it('liga o card à série, zera o envelhecimento (ENV-05) e mostra o ↻ com o próximo dia (REP-13)', () => {
    recurrence.save(t.db, compras, rule(), SAVE)
    const detail = cards.get(t.db, compras)
    expect(detail.recurrence).toMatchObject({
      freq: 'weekly',
      weekdays: SEG,
      anchorDate: '2026-10-21',
      dueCount: 0,
      paused: false,
      next: '2026-10-26T08:00'
    })
    expect(detail.lastActivityAt).toBe(SAVE)
    expect(face(compras)).toMatchObject({ recurring: true, nextRepeat: '2026-10-26T08:00' })
  })

  it('alterar a regra mantém a contagem e vale a partir de agora', () => {
    recurrence.save(t.db, compras, rule({ ifPreviousOpen: 'create' }), SAVE)
    recurrence.processDue(t.db, at(10, 26, 9))
    recurrence.save(t.db, compras, rule({ freq: 'daily' }), at(10, 27))
    const row = t.db.select().from(recurrenceTable).get()!
    expect(row).toMatchObject({
      freq: 'daily',
      weekdays: 0,
      dueCount: 1,
      anchorDate: '2026-10-27',
      lastProcessed: '2026-10-27T10:00'
    })
    expect(t.db.select().from(recurrenceTable).all()).toHaveLength(1)
  })

  it('REP-03: a lista de destino precisa ser uma lista ativa do mesmo quadro', () => {
    const other = boards.create(t.db, 'Estudos', SAVE)
    const otherList = boards.get(t.db, other.id).lists[0]!.id
    expect(() => recurrence.save(t.db, compras, rule({ targetListId: otherList }), SAVE)).toThrow(
      /lista ativa do quadro/
    )
    lists.archive(t.db, listsOf['Em andamento']!, SAVE)
    expect(() =>
      recurrence.save(t.db, compras, rule({ targetListId: listsOf['Em andamento']! }), SAVE)
    ).toThrow(/lista ativa/)
  })

  it('REP-01 e REP-06: a entrada exige os dias, o dia do mês, o N e o término', () => {
    const ok = (changes: Partial<RecurrenceRuleInput>) =>
      recurrenceRuleInput.safeParse(rule(changes)).success
    expect(ok({})).toBe(true)
    expect(ok({ weekdays: 0 })).toBe(false)
    expect(ok({ freq: 'monthly', monthDay: null })).toBe(false)
    expect(ok({ freq: 'monthly', monthDay: 32 })).toBe(false)
    expect(ok({ freq: 'every_n', intervalDays: null })).toBe(false)
    expect(ok({ freq: 'every_n', intervalDays: 366 })).toBe(false)
    expect(ok({ endsKind: 'on_date', endsOn: null })).toBe(false)
    expect(ok({ endsKind: 'on_date', endsOn: '2026-02-30' })).toBe(false)
    expect(ok({ endsKind: 'after_count', endsAfter: null })).toBe(false)
    expect(ok({ time: '24:00' })).toBe(false)
  })

  it('REP-15: remover deixa os cards já criados, sem o ↻, e apaga as ocorrências', () => {
    recurrence.save(t.db, compras, rule({ ifPreviousOpen: 'create' }), SAVE)
    recurrence.processDue(t.db, at(10, 26, 9))
    const created = newest().id
    recurrence.remove(t.db, created, at(10, 27))
    expect(t.db.select().from(recurrenceTable).all()).toEqual([])
    expect(occurrences()).toEqual([])
    expect(cards.get(t.db, created)).toMatchObject({ recurrence: null })
    expect(face(compras)).toMatchObject({ recurring: false, nextRepeat: null })
    expect(cards.get(t.db, created).lastActivityAt).toBe(at(10, 27))
  })
})

describe('agendador: criar o card (REP-04, REP-12)', () => {
  beforeEach(() => {
    const [roxo] = t.db.select().from(label).where(eq(label.boardId, boardId)).all()
    cards.setLabels(t.db, compras, [roxo!.id], SAVE)
    cards.update(
      t.db,
      {
        cardId: compras,
        priority: 2,
        due: { dueAt: '2026-10-21T18:00', reminder: 'day_before' },
        description: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pão e leite' }] }]
        },
        note: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'só minha' }] }]
        }
      },
      SAVE
    )
    const list = checklists.create(t.db, compras, 'Itens', SAVE)
    const item = checklists.createItem(t.db, list.id, 'Leite', SAVE)
    checklists.toggleItem(t.db, item.id, true, SAVE)
    checklists.updateItem(
      t.db,
      { itemId: item.id, due: { dueDate: '2026-10-22', showInCalendar: true } },
      SAVE
    )
  })

  it('nada antes do horário; no horário, com o anterior finalizado, cria no topo da lista', () => {
    recurrence.save(t.db, compras, rule(), SAVE)
    finish(compras)
    expect(recurrence.processDue(t.db, at(10, 26, 7, 59))).toBe(false)
    cards.create(t.db, listsOf['A fazer']!, 'Outro', SAVE)
    const now = at(10, 26, 8)
    expect(recurrence.processDue(t.db, now)).toBe(true)

    const created = newest()
    expect(created).toMatchObject({
      listId: listsOf['A fazer'],
      title: 'Compras',
      isDone: false,
      priority: 2,
      descriptionText: 'Pão e leite',
      noteHtml: '',
      dueAt: null,
      reminder: 'none',
      occurrenceDate: '2026-10-26T08:00',
      lastActivityAt: now
    })
    expect(boards.get(t.db, boardId).lists[0]!.cards.map((c) => c.title)).toEqual([
      'Compras',
      'Outro'
    ])
    const detail = cards.get(t.db, created.id)
    expect(detail.labelIds).toHaveLength(1)
    expect(detail.checklists).toEqual([
      expect.objectContaining({
        title: 'Itens',
        items: [expect.objectContaining({ text: 'Leite', isDone: false, dueDate: null })]
      })
    ])
    expect(detail.activity.map((a) => [a.kind, a.data])).toEqual([
      ['from_recurrence', { date: '2026-10-26T08:00' }]
    ])
    expect(occurrences()).toEqual([
      expect.objectContaining({ status: 'created', cardId: created.id })
    ])
    expect(t.db.select().from(recurrenceTable).get()).toMatchObject({
      dueCount: 1,
      lastProcessed: '2026-10-26T08:00'
    })
  })

  it('copia a data de entrega (dia da repetição + horário da regra, com o lembrete da origem); sem as opções, só o título', () => {
    recurrence.save(t.db, compras, rule({ copyDueDate: true }), SAVE)
    finish(compras)
    recurrence.processDue(t.db, at(10, 26, 9))
    expect(newest()).toMatchObject({ dueAt: '2026-10-26T08:00', reminder: 'day_before' })

    recurrence.save(
      t.db,
      compras,
      rule({ copyLabelsPriority: false, copyDescription: false, copyChecklist: false }),
      at(10, 26, 9)
    )
    finish(newest().id, at(10, 26, 9))
    recurrence.processDue(t.db, at(11, 2, 9))
    const plain = cards.get(t.db, newest().id)
    expect(plain).toMatchObject({ title: 'Compras', priority: null, labelIds: [], checklists: [] })
    expect(plain.descriptionHtml).toBe('')
  })

  it('REP-05: copia do card mais recente da série', () => {
    recurrence.save(t.db, compras, rule({ ifPreviousOpen: 'create' }), SAVE)
    recurrence.processDue(t.db, at(10, 26, 9))
    cards.update(t.db, { cardId: newest().id, title: 'Compras da semana' }, at(10, 26, 9))
    recurrence.processDue(t.db, at(11, 2, 9))
    expect(newest().title).toBe('Compras da semana')
    expect(series()).toHaveLength(3)
  })

  it('rodar duas vezes no mesmo minuto não duplica nada', () => {
    recurrence.save(t.db, compras, rule(), SAVE)
    finish(compras)
    expect(recurrence.processDue(t.db, at(10, 26, 8))).toBe(true)
    expect(recurrence.processDue(t.db, at(10, 26, 8))).toBe(false)
    expect(series()).toHaveLength(2)
    expect(occurrences()).toHaveLength(1)
  })
})

describe('agendador: anterior em aberto (REP-07 a REP-09)', () => {
  it('REP-08: pula, avisa no anterior e conta a ocorrência', () => {
    recurrence.save(t.db, compras, rule(), SAVE)
    expect(recurrence.processDue(t.db, at(10, 26, 9))).toBe(true)
    expect(series()).toHaveLength(1)
    expect(occurrences()).toEqual([
      expect.objectContaining({
        status: 'skipped',
        occurrenceDate: '2026-10-26T08:00',
        noticeCardId: compras
      })
    ])
    const detail = cards.get(t.db, compras)
    expect(detail.skipNotice).toMatchObject({
      occurrence: '2026-10-26T08:00',
      next: '2026-11-02T08:00'
    })
    expect(detail.activity[0]).toMatchObject({
      kind: 'recurrence_skipped',
      data: { date: '2026-10-26T08:00' }
    })
    expect(t.db.select().from(recurrenceTable).get()!.dueCount).toBe(1)
  })

  it('FIN-04: o ✓ fora da lista de conclusão não conta como concluído', () => {
    recurrence.save(t.db, compras, rule(), SAVE)
    cards.update(t.db, { cardId: compras, isDone: true }, SAVE)
    recurrence.processDue(t.db, at(10, 26, 9))
    expect(occurrences()[0]!.status).toBe('skipped')
  })

  it('"Criar mesmo assim" na regra cria com o anterior em aberto', () => {
    recurrence.save(t.db, compras, rule({ ifPreviousOpen: 'create' }), SAVE)
    recurrence.processDue(t.db, at(10, 26, 9))
    expect(series()).toHaveLength(2)
    expect(occurrences()[0]!.status).toBe('created')
  })

  it('REP-09: "Criar agora mesmo assim" cria o card daquela ocorrência e some com o aviso', () => {
    recurrence.save(t.db, compras, rule({ copyDueDate: true }), SAVE)
    recurrence.processDue(t.db, at(10, 26, 9))
    const notice = cards.get(t.db, compras).skipNotice!
    const created = recurrence.createAnyway(t.db, notice.occurrenceId, at(10, 27))
    expect(cards.get(t.db, created)).toMatchObject({ dueAt: '2026-10-26T08:00' })
    expect(t.db.select().from(card).where(eq(card.id, created)).get()).toMatchObject({
      occurrenceDate: '2026-10-26T08:00',
      lastActivityAt: at(10, 27)
    })
    expect(cards.get(t.db, compras).skipNotice).toBeNull()
    expect(occurrences()[0]).toMatchObject({ status: 'created_anyway', cardId: created })
    expect(() => recurrence.createAnyway(t.db, notice.occurrenceId, at(10, 27))).toThrow(
      /não está pulada/
    )
  })

  it('REP-09: "Dispensar" só some com o aviso; a ocorrência continua pulada', () => {
    recurrence.save(t.db, compras, rule(), SAVE)
    recurrence.processDue(t.db, at(10, 26, 9))
    const notice = cards.get(t.db, compras).skipNotice!
    recurrence.dismiss(t.db, notice.occurrenceId, at(10, 27))
    expect(cards.get(t.db, compras).skipNotice).toBeNull()
    expect(occurrences()[0]).toMatchObject({ status: 'skipped', dismissedAt: at(10, 27) })
  })

  it('o aviso mais novo substitui o anterior no card', () => {
    recurrence.save(t.db, compras, rule(), SAVE)
    recurrence.processDue(t.db, at(10, 26, 9))
    recurrence.processDue(t.db, at(11, 2, 9))
    expect(cards.get(t.db, compras).skipNotice!.occurrence).toBe('2026-11-02T08:00')
    expect(occurrences().filter((o) => o.dismissedAt === null)).toHaveLength(1)
  })

  it('REP-07: com o anterior arquivado, não há anterior e o card é criado', () => {
    recurrence.save(t.db, compras, rule(), SAVE)
    cards.archive(t.db, compras, SAVE)
    recurrence.processDue(t.db, at(10, 26, 9))
    expect(occurrences()[0]!.status).toBe('created')
    expect(newest().title).toBe('Compras')
  })
})

describe('agendador: app fechado e pausa (REP-10, REP-16)', () => {
  it('REP-10: 10 dias fechado numa repetição diária cria 1 e registra 9 como perdidas', () => {
    recurrence.save(t.db, compras, rule({ freq: 'daily' }), SAVE)
    finish(compras)
    recurrence.processDue(t.db, at(10, 31, 10))
    const all = occurrences()
    expect(all.filter((o) => o.status === 'missed')).toHaveLength(9)
    expect(all.at(-1)).toMatchObject({ status: 'created', occurrenceDate: '2026-10-31T08:00' })
    expect(series()).toHaveLength(2)
    expect(t.db.select().from(recurrenceTable).get()!.dueCount).toBe(10)
    expect(cards.get(t.db, compras).activity[0]).toMatchObject({
      kind: 'recurrence_missed',
      data: { from: '2026-10-22T08:00', to: '2026-10-30T08:00', count: 9 }
    })
  })

  it('REP-16: lista de destino arquivada pausa; ao voltar, vale a REP-10 para o período parado', () => {
    recurrence.save(t.db, compras, rule({ ifPreviousOpen: 'create' }), SAVE)
    lists.archive(t.db, listsOf['A fazer']!, SAVE)
    expect(recurrence.processDue(t.db, at(11, 9, 9))).toBe(false)
    expect(cards.get(t.db, compras).recurrence).toMatchObject({ paused: true })
    expect(face(compras)).toBeUndefined()
    lists.restore(t.db, listsOf['A fazer']!, at(11, 9, 9))
    expect(face(compras)).toMatchObject({ recurring: true, nextRepeat: '2026-10-26T08:00' })
    recurrence.processDue(t.db, at(11, 9, 9))
    expect(occurrences().map((o) => o.status)).toEqual(['missed', 'missed', 'created'])
  })

  it('REP-16: quadro fechado pausa; lista de destino excluída também', () => {
    recurrence.save(t.db, compras, rule({ ifPreviousOpen: 'create' }), SAVE)
    boards.close(t.db, boardId, SAVE)
    expect(recurrence.processDue(t.db, at(10, 26, 9))).toBe(false)
    boards.reopen(t.db, boardId, SAVE)
    t.db.update(recurrenceTable).set({ targetListId: null }).run()
    expect(recurrence.processDue(t.db, at(10, 26, 9))).toBe(false)
    expect(face(compras)).toMatchObject({ recurring: true, nextRepeat: null })
  })

  it('REP-06: depois de N vezes, para (as perdidas contam) e o ↻ some', () => {
    recurrence.save(
      t.db,
      compras,
      rule({ freq: 'daily', endsKind: 'after_count', endsAfter: 2, ifPreviousOpen: 'create' }),
      SAVE
    )
    recurrence.processDue(t.db, at(10, 26, 9))
    expect(occurrences().map((o) => o.status)).toEqual(['missed', 'created'])
    expect(recurrence.processDue(t.db, at(10, 30, 9))).toBe(false)
    expect(face(compras)).toMatchObject({ recurring: false, nextRepeat: null })
  })

  it('REP-06: em uma data, vale até ela', () => {
    recurrence.save(
      t.db,
      compras,
      rule({ freq: 'daily', endsKind: 'on_date', endsOn: '2026-10-23', ifPreviousOpen: 'create' }),
      SAVE
    )
    recurrence.processDue(t.db, at(10, 31, 9))
    expect(occurrences().map((o) => o.occurrenceDate)).toEqual([
      '2026-10-22T08:00',
      '2026-10-23T08:00'
    ])
  })

  it('sem nenhum card na série, a repetição sai', () => {
    recurrence.save(t.db, compras, rule(), SAVE)
    cards.remove(t.db, compras)
    expect(recurrence.processDue(t.db, at(10, 26, 9))).toBe(true)
    expect(t.db.select().from(recurrenceTable).all()).toEqual([])
  })
})

describe('calendário: repetições fantasma (REP-14)', () => {
  it('as próximas do mês, as puladas e as perdidas, com o título do card mais recente', () => {
    recurrence.save(t.db, compras, rule({ freq: 'weekly', weekdays: SEG }), SAVE)
    // Outubro: só 26/10 vem depois de salvar.
    const october = recurrence.calendarRepeats(t.db, {
      from: '2026-10-01',
      to: '2026-11-01',
      boardId
    })
    expect(october.map((r) => [r.kind, r.occurrence, r.title, r.cardId])).toEqual([
      ['next', '2026-10-26T08:00', 'Compras', compras]
    ])
    recurrence.processDue(t.db, at(11, 2, 9))
    const november = recurrence.calendarRepeats(t.db, {
      from: '2026-11-01',
      to: '2026-12-01',
      boardId: null
    })
    expect(november.map((r) => [r.kind, r.occurrence])).toEqual([
      ['skipped', '2026-11-02T08:00'],
      ['next', '2026-11-09T08:00'],
      ['next', '2026-11-16T08:00'],
      ['next', '2026-11-23T08:00'],
      ['next', '2026-11-30T08:00']
    ])
    expect(
      recurrence
        .calendarRepeats(t.db, { from: '2026-10-01', to: '2026-11-01', boardId })
        .map((r) => [r.kind, r.occurrence])
    ).toEqual([['missed', '2026-10-26T08:00']])
  })

  it('pausada não mostra as próximas; quadro fechado não mostra nada', () => {
    recurrence.save(t.db, compras, rule(), SAVE)
    lists.archive(t.db, listsOf['A fazer']!, SAVE)
    const range = { from: '2026-10-01', to: '2026-11-01', boardId: null }
    expect(recurrence.calendarRepeats(t.db, range)).toEqual([])
    lists.restore(t.db, listsOf['A fazer']!, SAVE)
    boards.close(t.db, boardId, SAVE)
    expect(recurrence.calendarRepeats(t.db, range)).toEqual([])
  })

  it('a ocorrência repetida não entra duas vezes (UNIQUE)', () => {
    recurrence.save(t.db, compras, rule(), SAVE)
    const row = t.db.select().from(recurrenceTable).get()!
    const insert = () =>
      t.db
        .insert(recurrenceOccurrence)
        .values({
          id: randomUUID(),
          recurrenceId: row.id,
          occurrenceDate: '2026-10-26T08:00',
          status: 'missed',
          createdAt: SAVE
        })
        .run()
    insert()
    expect(insert).toThrow(/UNIQUE/)
    expect(
      t.db
        .select()
        .from(recurrenceOccurrence)
        .where(and(eq(recurrenceOccurrence.recurrenceId, row.id)))
        .all()
    ).toHaveLength(1)
  })
})

describe('checklist copiado', () => {
  it('itens desmarcados e sem data, na mesma ordem', () => {
    const list = checklists.create(t.db, compras, 'Itens', SAVE)
    for (const text of ['Um', 'Dois']) checklists.createItem(t.db, list.id, text, SAVE)
    t.db.update(checklistItem).set({ isDone: true, dueDate: '2026-10-22' }).run()
    recurrence.save(t.db, compras, rule({ ifPreviousOpen: 'create' }), SAVE)
    recurrence.processDue(t.db, at(10, 26, 9))
    expect(cards.get(t.db, newest().id).checklists[0]!.items).toEqual([
      expect.objectContaining({ text: 'Um', isDone: false, dueDate: null }),
      expect.objectContaining({ text: 'Dois', isDone: false, dueDate: null })
    ])
  })
})
