import fs from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, insertCard } from '../db/test-db'
import { activity, card } from '../db/schema'
import * as attachments from './attachments'
import * as boards from './boards'
import * as cards from './cards'
import { createTestFiles, PNG_1X1 } from './test-files'

const NOW = 1_800_000_000_000
const LATER = NOW + 86_400_000

let t: ReturnType<typeof createTestDb>
let files: ReturnType<typeof createTestFiles>
let cardId: string

beforeEach(() => {
  t = createTestDb()
  files = createTestFiles()
  const boardId = boards.create(t.db, 'Casa', NOW).id
  cardId = insertCard(t.db, boards.get(t.db, boardId).lists[0]!.id, { title: 'Viagem' })
})

afterEach(() => files.cleanup())

const row = () => t.db.select().from(card).where(eq(card.id, cardId)).get()!
const detail = () => cards.get(t.db, cardId)

async function attach(...samples: [string, string | Uint8Array][]) {
  const picks = samples.map(([name, content]) => ({ path: files.sample(name, content), name }))
  await attachments.add(t.db, files.store, cardId, picks, NOW)
  return detail().attachments
}

describe('anexar (ANX-01 a ANX-03)', () => {
  it('guarda o nome original, o tamanho e a miniatura das imagens; zera o envelhecimento', async () => {
    const [foto, pdf] = await attach(['foto da pousada.png', PNG_1X1], ['passagens.pdf', 'bilhete'])
    expect(pdf).toMatchObject({ name: 'passagens.pdf', ext: 'pdf', size: 7, isImage: false })
    expect(pdf!.url).toBeNull()
    expect(foto).toMatchObject({ name: 'foto da pousada.png', isImage: true, width: 1, height: 1 })
    expect(foto!.url).toBe(`mello-arquivo://arquivos/${foto!.fileId}.png`)
    expect(row().lastActivityAt).toBe(NOW)
    expect(t.db.select().from(activity).all()).toEqual([])
  })

  it('ANX-02: o mesmo arquivo anexado duas vezes é guardado uma vez só', async () => {
    await attach(['lista.txt', 'pão'])
    const list = await attach(['lista (1).txt', 'pão'])
    expect(list.map((a) => a.name).sort()).toEqual(['lista (1).txt', 'lista.txt'])
    expect(files.stored()).toHaveLength(1)
  })

  it('a face mostra a quantidade de anexos', async () => {
    await attach(['a.txt', 'a'], ['b.txt', 'b'])
    const face = boards.get(t.db, detail().boardId).lists[0]!.cards[0]!
    expect(face.attachmentCount).toBe(2)
  })
})

describe('abrir (ANX-03)', () => {
  it('abre uma cópia só leitura, com o nome original, e não o arquivo guardado', async () => {
    const [pdf] = await attach(['passagens.pdf', 'bilhete'])
    expect(await attachments.open(t.db, files.store, pdf!.id)).toEqual({ shownInFolder: false })
    const [opened] = files.opened
    expect(path.basename(opened!)).toBe('passagens.pdf')
    expect(opened!.startsWith(files.store.system.tempDir)).toBe(true)
    expect(fs.readFileSync(opened!, 'utf8')).toBe('bilhete')
    expect(() => fs.writeFileSync(opened!, 'mudei')).toThrow()
    // Abrir de novo substitui a cópia (só leitura) sem erro.
    await attachments.open(t.db, files.store, pdf!.id)
    expect(files.opened).toHaveLength(2)
  })

  it('abrir não zera o envelhecimento', async () => {
    const [pdf] = await attach(['passagens.pdf', 'bilhete'])
    t.db.update(card).set({ lastActivityAt: 1 }).where(eq(card.id, cardId)).run()
    await attachments.open(t.db, files.store, pdf!.id)
    expect(row().lastActivityAt).toBe(1)
  })

  it('programa não é executado: é mostrado na pasta', async () => {
    const [exe] = await attach(['instalador.exe', 'MZ'])
    expect(exe!.isProgram).toBe(true)
    expect(await attachments.open(t.db, files.store, exe!.id)).toEqual({ shownInFolder: true })
    expect(files.opened).toEqual([])
    expect(path.basename(files.shown[0]!)).toBe('instalador.exe')
  })

  it('arquivo que sumiu da pasta avisa', async () => {
    const [pdf] = await attach(['passagens.pdf', 'bilhete'])
    fs.rmSync(path.join(files.dir, `${pdf!.fileId}.pdf`))
    await expect(attachments.open(t.db, files.store, pdf!.id)).rejects.toThrow(
      /não está mais na pasta/
    )
  })

  it('nomes que o Windows não aceita viram nomes válidos', () => {
    expect(attachments.windowsName('a:b?.txt', 'txt')).toBe('a_b_.txt')
    expect(attachments.windowsName('CON.txt', 'txt')).toBe('_CON.txt')
    expect(attachments.windowsName('LEIA-ME', 'pdf')).toBe('LEIA-ME.pdf')
    expect(attachments.windowsName('fim. ', 'bin')).toBe('fim')
    expect(attachments.windowsName(`${'x'.repeat(300)}.pdf`, 'pdf')).toHaveLength(200)
  })
})

describe('remover (ANX-04, CAP-03)', () => {
  it('tira a referência, zera o envelhecimento e deixa o arquivo para a limpeza (DAD-08)', async () => {
    const [pdf] = await attach(['passagens.pdf', 'bilhete'])
    attachments.remove(t.db, pdf!.id, LATER)
    expect(detail().attachments).toEqual([])
    expect(row().lastActivityAt).toBe(LATER)
    expect(files.stored()).toHaveLength(1)
  })

  it('CAP-03: remover o anexo da capa remove a capa', async () => {
    const [foto] = await attach(['foto.png', PNG_1X1])
    attachments.setCover(t.db, cardId, { kind: 'image', fileId: foto!.fileId }, NOW)
    expect(detail().cover).toMatchObject({ kind: 'image', fileId: foto!.fileId })
    attachments.remove(t.db, foto!.id, LATER)
    expect(detail().cover).toBeNull()
  })

  it('CAP-03: com outro anexo do mesmo arquivo, a capa fica', async () => {
    await attach(['foto.png', PNG_1X1])
    const both = await attach(['foto (2).png', PNG_1X1])
    attachments.setCover(t.db, cardId, { kind: 'image', fileId: both[0]!.fileId }, NOW)
    attachments.remove(t.db, both[0]!.id, LATER)
    expect(detail().cover).toMatchObject({ kind: 'image' })
  })
})

describe('capa (CAP-01, CAP-02)', () => {
  it('cor da paleta; a mesma não grava; null remove', () => {
    attachments.setCover(t.db, cardId, { kind: 'color', color: '#206a83' }, NOW)
    expect(detail().cover).toEqual({ kind: 'color', color: '#206a83' })
    expect(row().lastActivityAt).toBe(NOW)
    attachments.setCover(t.db, cardId, { kind: 'color', color: '#206a83' }, LATER)
    expect(row().lastActivityAt).toBe(NOW)
    attachments.setCover(t.db, cardId, null, LATER)
    expect(detail().cover).toBeNull()
    expect(row().lastActivityAt).toBe(LATER)
  })

  it('imagem só se for um anexo de imagem deste card', async () => {
    const [pdf] = await attach(['passagens.pdf', 'bilhete'])
    expect(() =>
      attachments.setCover(t.db, cardId, { kind: 'image', fileId: pdf!.fileId }, NOW)
    ).toThrow(/imagem anexada a este card/)
    expect(() =>
      attachments.setCover(t.db, cardId, { kind: 'image', fileId: 'b'.repeat(64) }, NOW)
    ).toThrow(/imagem anexada a este card/)
  })

  it('imagem enviada na hora vira capa e não vira anexo; o que não é imagem é recusado', async () => {
    await attachments.uploadCover(t.db, files.store, cardId, files.sample('c.png', PNG_1X1), LATER)
    expect(detail().cover).toMatchObject({ kind: 'image', width: 1, height: 1 })
    expect(detail().attachments).toEqual([])
    expect(row().lastActivityAt).toBe(LATER)
    await expect(
      attachments.uploadCover(t.db, files.store, cardId, files.sample('x.png', 'texto'), LATER)
    ).rejects.toThrow(/Escolha uma imagem/)
  })

  it('a face do card traz a capa com o tamanho da imagem', async () => {
    await attachments.uploadCover(t.db, files.store, cardId, files.sample('c.png', PNG_1X1), NOW)
    const face = boards.get(t.db, detail().boardId).lists[0]!.cards[0]!
    expect(face.cover).toMatchObject({ kind: 'image', width: 1, height: 1 })
    expect(face.cover?.kind === 'image' && face.cover.url).toMatch(/^mello-arquivo:\/\/arquivos\//)
  })
})
