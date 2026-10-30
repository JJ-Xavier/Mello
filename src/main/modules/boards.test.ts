import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fileUrl } from '../../shared/files'
import {
  createBoardInput,
  setBackgroundInput,
  updateBoardInput,
  type SetBackgroundInput
} from '../../shared/ipc/boards'
import { agingTone, toneForBackground } from '../../shared/rules/tone'
import { createTestDb, insertCard } from '../db/test-db'
import {
  activity,
  attachment,
  board,
  card,
  checklist,
  file,
  label,
  list,
  recurrence
} from '../db/schema'
import * as boards from './boards'
import { DEFAULT_LABEL_COLORS } from './labels'
import { createTestFiles, jpegHeader, PNG_1X1 } from './test-files'

const NOW = 1_800_000_000_000

let t: ReturnType<typeof createTestDb>

beforeEach(() => {
  t = createTestDb()
})

function titles(): string[] {
  return boards.listOpen(t.db).map((b) => b.title)
}

describe('quadros', () => {
  it('QUA-01: título de 1 a 80 caracteres, sem espaços nas pontas', () => {
    expect(createBoardInput.parse({ title: '  Casa  ' }).title).toBe('Casa')
    expect(createBoardInput.safeParse({ title: '   ' }).success).toBe(false)
    expect(createBoardInput.safeParse({ title: 'x'.repeat(80) }).success).toBe(true)
    expect(createBoardInput.safeParse({ title: 'x'.repeat(81) }).success).toBe(false)
    expect(updateBoardInput.safeParse({ boardId: randomUUID(), title: '' }).success).toBe(false)
  })

  it('QUA-02: quadro novo nasce com as 4 listas; Concluído e Entregue são de conclusão e não envelhecem', () => {
    const created = boards.create(t.db, 'Casa', NOW)
    const lists = boards.get(t.db, created.id).lists
    expect(lists.map((l) => [l.title, l.isDoneList, l.freezesAging])).toEqual([
      ['A fazer', false, false],
      ['Em andamento', false, false],
      ['Concluído', true, true],
      ['Entregue', true, true]
    ])
    expect(lists.every((l) => l.cardCount === 0)).toBe(true)
  })

  it('QUA-03: fundo Mello, tom derivado do fundo e as 6 etiquetas padrão sem nome', () => {
    const created = boards.create(t.db, 'Casa', NOW)
    const detail = boards.get(t.db, created.id)
    expect(detail.background).toMatchObject({ kind: 'gradient', value: 'mello', url: null })
    expect(detail.bgTone).toBe(toneForBackground('gradient', 'mello'))
    const labels = t.db
      .select()
      .from(label)
      .where(eq(label.boardId, created.id))
      .orderBy(label.position)
      .all()
    expect(labels.map((l) => l.color)).toEqual(DEFAULT_LABEL_COLORS)
    expect(labels.every((l) => l.name === null)).toBe(true)
  })

  it('quadros novos vão para o fim', () => {
    boards.create(t.db, 'Um', NOW)
    boards.create(t.db, 'Dois', NOW)
    boards.create(t.db, 'Três', NOW)
    expect(titles()).toEqual(['Um', 'Dois', 'Três'])
  })

  it('renomear e favoritar', () => {
    const created = boards.create(t.db, 'Casa', NOW)
    const updated = boards.update(
      t.db,
      { boardId: created.id, title: 'Minha casa', isFavorite: true },
      NOW
    )
    expect([updated.title, updated.isFavorite]).toEqual(['Minha casa', true])
  })

  it('QUA-04: fechar tira do Início e põe nos fechados; reabrir devolve', () => {
    const a = boards.create(t.db, 'Um', NOW)
    boards.create(t.db, 'Dois', NOW)
    boards.close(t.db, a.id, NOW + 5)
    expect(titles()).toEqual(['Dois'])
    expect(boards.listClosed(t.db).map((b) => [b.title, b.closedAt])).toEqual([['Um', NOW + 5]])
    boards.reopen(t.db, a.id, NOW + 9)
    expect(titles()).toEqual(['Um', 'Dois'])
    expect(boards.listClosed(t.db)).toEqual([])
  })

  it('QUA-06: favoritos primeiro; dentro de cada grupo vale a ordem manual', () => {
    const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((title) => boards.create(t.db, title, NOW))
    boards.update(t.db, { boardId: c!.id, isFavorite: true }, NOW)
    boards.update(t.db, { boardId: a!.id, isFavorite: true }, NOW)
    expect(titles()).toEqual(['A', 'C', 'B', 'D'])

    boards.move(t.db, c!.id, 0, NOW) // C antes de A, entre os favoritos
    expect(titles()).toEqual(['C', 'A', 'B', 'D'])
    boards.move(t.db, b!.id, 1, NOW) // B depois de D, entre os não favoritos
    expect(titles()).toEqual(['C', 'A', 'D', 'B'])
    boards.move(t.db, d!.id, 0, NOW)
    expect(titles()).toEqual(['C', 'A', 'D', 'B'])
  })

  it('mover para o lugar onde já está não grava nada', () => {
    const [a] = ['A', 'B'].map((title) => boards.create(t.db, title, NOW))
    const before = t.db.select().from(board).where(eq(board.id, a!.id)).get()!
    boards.move(t.db, a!.id, 0, NOW + 1000)
    const after = t.db.select().from(board).where(eq(board.id, a!.id)).get()!
    expect(after).toEqual(before)
  })

  it('QUA-07: excluir só um quadro fechado', () => {
    const a = boards.create(t.db, 'Um', NOW)
    expect(() => boards.remove(t.db, a.id)).toThrow(/Feche o quadro/)
  })

  it('QUA-07: excluir apaga listas, cards, etiquetas, checklists, atividade, anexos e repetições', () => {
    const keep = boards.create(t.db, 'Fica', NOW)
    const gone = boards.create(t.db, 'Sai', NOW)
    const listId = boards.get(t.db, gone.id).lists[0]!.id
    const labelId = t.db.select().from(label).where(eq(label.boardId, gone.id)).get()!.id
    const cardId = insertCard(t.db, listId, {
      labelIds: [labelId],
      checklist: { title: 'Passos', items: [{ text: 'um', isDone: false }] }
    })
    t.db
      .insert(activity)
      .values({ id: randomUUID(), cardId, kind: 'created', data: '{}', createdAt: NOW })
      .run()
    t.db
      .insert(file)
      .values({ id: 'f'.repeat(64), ext: 'png', mime: 'image/png', size: 1, createdAt: NOW })
      .run()
    t.db
      .insert(attachment)
      .values({
        id: randomUUID(),
        cardId,
        fileId: 'f'.repeat(64),
        name: 'foto.png',
        createdAt: NOW
      })
      .run()
    t.db
      .insert(recurrence)
      .values({
        id: randomUUID(),
        boardId: gone.id,
        freq: 'daily',
        anchorDate: '2026-10-21',
        time: '08:00',
        targetListId: listId,
        copyLabelsPriority: true,
        copyDescription: true,
        copyChecklist: true,
        copyDueDate: false,
        createdAt: NOW,
        updatedAt: NOW
      })
      .run()

    boards.close(t.db, gone.id, NOW)
    boards.remove(t.db, gone.id)

    expect(
      t.db
        .select()
        .from(board)
        .all()
        .map((b) => b.id)
    ).toEqual([keep.id])
    expect(
      t.db
        .select()
        .from(list)
        .all()
        .every((l) => l.boardId === keep.id)
    ).toBe(true)
    expect(
      t.db
        .select()
        .from(label)
        .all()
        .every((l) => l.boardId === keep.id)
    ).toBe(true)
    for (const table of [card, checklist, activity, attachment, recurrence]) {
      expect(t.db.select().from(table).all()).toEqual([])
    }
    // O arquivo físico só sai na limpeza de órfãos (DAD-08).
    expect(t.db.select().from(file).all()).toHaveLength(1)
  })

  it('itens arquivados: cards e listas do quadro, do mais recente para o mais antigo', () => {
    const created = boards.create(t.db, 'Casa', NOW)
    const [aFazer, emAndamento] = boards.get(t.db, created.id).lists
    insertCard(t.db, aFazer!.id, { title: 'Velho', archivedAt: NOW + 1 })
    insertCard(t.db, aFazer!.id, { title: 'Novo', archivedAt: NOW + 2 })
    insertCard(t.db, aFazer!.id, { title: 'Ativo' })
    t.db
      .update(list)
      .set({ archivedAt: NOW + 3 })
      .where(eq(list.id, emAndamento!.id))
      .run()

    const items = boards.archived(t.db, created.id)
    expect(items.cards.map((c) => [c.title, c.listTitle])).toEqual([
      ['Novo', 'A fazer'],
      ['Velho', 'A fazer']
    ])
    expect(items.lists.map((l) => l.title)).toEqual(['Em andamento'])
  })

  it('quadro inexistente dá NOT_FOUND', () => {
    expect(() => boards.get(t.db, randomUUID())).toThrow(/não encontrado/)
  })
})

describe('fundo do quadro (FUN)', () => {
  let files: ReturnType<typeof createTestFiles>
  let boardId: string

  beforeEach(() => {
    files = createTestFiles()
    boardId = boards.create(t.db, 'Casa', NOW).id
  })
  afterEach(() => files.cleanup())

  const pick = (name: string, content: string | Uint8Array, size?: number) => {
    const path = files.sample(name, content)
    return { path, name, size: size ?? Buffer.byteLength(content) }
  }
  const upload = (name: string, content: string | Uint8Array, size?: number) =>
    boards.uploadBackground(t.db, files.store, boardId, pick(name, content, size), NOW)
  const imageBackground = (fileId: string, changes = {}): SetBackgroundInput['background'] => ({
    kind: 'image',
    value: fileId,
    auto: true,
    focus: 2,
    zoom: 112,
    dim: 30,
    blur: 6,
    avgColor: '#3366cc',
    ...changes
  })
  const background = () => boards.get(t.db, boardId).background

  it('FUN-01: cor e gradiente do protótipo, com o tom do envelhecimento de cada um (FUN-09)', () => {
    boards.setBackground(t.db, { boardId, background: { kind: 'color', value: '#216e4e' } }, NOW)
    expect(background()).toMatchObject({ kind: 'color', value: '#216e4e', url: null })
    expect(boards.get(t.db, boardId).bgTone).toBe(toneForBackground('color', '#216e4e'))
    boards.setBackground(t.db, { boardId, background: { kind: 'gradient', value: 'uva' } }, NOW)
    expect(boards.get(t.db, boardId)).toMatchObject({
      background: { kind: 'gradient', value: 'uva' },
      bgTone: toneForBackground('gradient', 'uva')
    })
    const parse = (value: unknown) => setBackgroundInput.safeParse({ boardId, background: value })
    expect(parse({ kind: 'color', value: '#123456' }).success).toBe(false)
    expect(parse({ kind: 'gradient', value: 'arco-iris' }).success).toBe(false)
  })

  it('FUN-02: guarda JPG, PNG e WEBP e devolve o endereço, o tamanho e o nome', async () => {
    const png = await upload('praia.png', PNG_1X1)
    expect(png).toMatchObject({ name: 'praia.png', width: 1, height: 1 })
    expect(png.url).toBe(fileUrl(png.fileId, 'png'))
    const jpg = await upload('retrato.jpg', jpegHeader(1080, 1920, 1))
    expect([jpg.width, jpg.height]).toEqual([1080, 1920])
    const webp = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([30, 0, 0, 0]),
      Buffer.from('WEBPVP8X'),
      Buffer.from([10, 0, 0, 0, 0, 0, 0, 0]),
      Buffer.from([0x7f, 0x07, 0x00, 0xaf, 0x04, 0x00])
    ])
    expect(await upload('vista.webp', webp)).toMatchObject({ width: 1920, height: 1200 })
    // Enviar não muda o quadro (FUN-07).
    expect(background().kind).toBe('gradient')
  })

  it('FUN-02: recusa outro formato, o que não é imagem e mais de 25 MB, sem copiar', async () => {
    const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.from([10, 0, 10, 0, 0, 0, 0])])
    await expect(upload('anima.gif', gif)).rejects.toThrow('Escolha uma imagem JPG, PNG ou WEBP.')
    await expect(upload('nota.txt', 'texto')).rejects.toThrow('JPG, PNG ou WEBP')
    await expect(upload('enorme.png', PNG_1X1, 26 * 1024 * 1024)).rejects.toThrow('25 MB')
    expect(files.stored()).toEqual([])
  })

  it('FUN-03: aplicar a imagem com os ajustes; o tom vem da cor média, guardada no arquivo', async () => {
    const saved = await upload('praia.png', PNG_1X1)
    boards.setBackground(t.db, { boardId, background: imageBackground(saved.fileId) }, NOW + 1)
    expect(boards.get(t.db, boardId)).toMatchObject({
      background: {
        kind: 'image',
        value: saved.fileId,
        url: saved.url,
        width: 1,
        height: 1,
        auto: true,
        focus: 2,
        zoom: 112,
        dim: 30,
        blur: 6
      },
      bgTone: agingTone('#3366cc')
    })
    expect(t.db.select().from(file).get()!.avgColor).toBe('#3366cc')
    // FUN-08: o Início e os quadros fechados também têm a imagem.
    expect(boards.listOpen(t.db)[0]!.background.url).toBe(saved.url)

    // O mesmo arquivo em outro quadro usa a cor média já guardada.
    const other = boards.create(t.db, 'Trabalho', NOW).id
    boards.setBackground(
      t.db,
      { boardId: other, background: imageBackground(saved.fileId, { avgColor: '#000000' }) },
      NOW
    )
    expect(boards.get(t.db, other).bgTone).toBe(agingTone('#3366cc'))
  })

  it('voltar para cor ou gradiente zera os ajustes da imagem', async () => {
    const saved = await upload('praia.png', PNG_1X1)
    boards.setBackground(t.db, { boardId, background: imageBackground(saved.fileId) }, NOW)
    boards.setBackground(t.db, { boardId, background: { kind: 'color', value: '#5e4db2' } }, NOW)
    expect(background()).toEqual({
      kind: 'color',
      value: '#5e4db2',
      url: null,
      width: null,
      height: null,
      auto: true,
      focus: 4,
      zoom: 100,
      dim: 0,
      blur: 0
    })
  })

  it('recusa imagem que não foi guardada e ajustes fora dos limites', () => {
    expect(() =>
      boards.setBackground(t.db, { boardId, background: imageBackground('a'.repeat(64)) }, NOW)
    ).toThrow('Envie de novo')
    const parse = (changes: object) =>
      setBackgroundInput.safeParse({
        boardId,
        background: imageBackground('a'.repeat(64), changes)
      })
    expect(parse({}).success).toBe(true)
    expect(parse({ focus: 9 }).success).toBe(false)
    expect(parse({ zoom: 99 }).success).toBe(false)
    expect(parse({ dim: 71 }).success).toBe(false)
    expect(parse({ blur: 21 }).success).toBe(false)
    expect(parse({ avgColor: 'azul' }).success).toBe(false)
  })
})
