import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../db/test-db'
import { file } from '../db/schema'
import * as attachments from './attachments'
import * as boards from './boards'
import * as cards from './cards'
import { cleanUnusedFiles, createPicks, extensionOf, sniffImage, storeFile } from './files'
import { createTestFiles, jpegHeader, PNG_1X1 } from './test-files'

const NOW = 1_800_000_000_000
const sha = (content: string | Uint8Array) => createHash('sha256').update(content).digest('hex')

let t: ReturnType<typeof createTestDb>
let files: ReturnType<typeof createTestFiles>

beforeEach(() => {
  t = createTestDb()
  files = createTestFiles()
})

afterEach(() => files.cleanup())

describe('guardar arquivos (ANX-01, ANX-02)', () => {
  it('copia para a pasta com o hash do conteúdo como nome', async () => {
    const source = files.sample('Passagens.PDF', 'bilhete')
    const stored = await storeFile(t.db, files.store, source, NOW)
    expect(stored).toEqual({
      id: sha('bilhete'),
      ext: 'pdf',
      mime: 'application/pdf',
      size: 7,
      width: null,
      height: null,
      avgColor: null,
      createdAt: NOW
    })
    expect(files.stored()).toEqual([`${sha('bilhete')}.pdf`])
    expect(fs.readFileSync(path.join(files.dir, `${stored.id}.pdf`), 'utf8')).toBe('bilhete')
  })

  it('o mesmo conteúdo, com outro nome, é guardado uma vez só', async () => {
    const first = await storeFile(t.db, files.store, files.sample('a.txt', 'igual'), NOW)
    const second = await storeFile(t.db, files.store, files.sample('b.md', 'igual'), NOW + 1)
    expect(second).toEqual(first)
    expect(files.stored()).toEqual([`${sha('igual')}.txt`])
    expect(t.db.select().from(file).all()).toHaveLength(1)
  })

  it('se o arquivo sumiu da pasta, guardar de novo devolve a cópia', async () => {
    const stored = await storeFile(t.db, files.store, files.sample('a.txt', 'oi'), NOW)
    fs.rmSync(path.join(files.dir, `${stored.id}.txt`))
    await storeFile(t.db, files.store, files.sample('a.txt', 'oi'), NOW)
    expect(files.stored()).toEqual([`${stored.id}.txt`])
  })

  it('imagem é reconhecida pelo conteúdo, com o tamanho', async () => {
    const stored = await storeFile(t.db, files.store, files.sample('foto.dat', PNG_1X1), NOW)
    expect(stored).toMatchObject({ ext: 'png', mime: 'image/png', width: 1, height: 1 })
  })

  it('imageOnly recusa o que não é imagem e não guarda nada', async () => {
    const source = files.sample('falsa.png', 'não sou imagem')
    await expect(storeFile(t.db, files.store, source, NOW, { imageOnly: true })).rejects.toThrow(
      /Escolha uma imagem/
    )
    expect(files.stored()).toEqual([])
    expect(t.db.select().from(file).all()).toEqual([])
  })

  it('extensão vira [a-z0-9] até 10; sem extensão válida, "bin"', () => {
    expect(extensionOf('Relatório.DOCX')).toBe('docx')
    expect(extensionOf('LEIA-ME')).toBe('bin')
    expect(extensionOf('a.tar.gz')).toBe('gz')
    expect(extensionOf('estranho.ç')).toBe('bin')
  })
})

describe('tamanho das imagens (ANX-03)', () => {
  it('foto de celular girada (EXIF 6) tem largura e altura trocadas', () => {
    expect(sniffImage(jpegHeader(4000, 3000, 1))).toEqual({
      ext: 'jpg',
      mime: 'image/jpeg',
      width: 4000,
      height: 3000
    })
    expect(sniffImage(jpegHeader(4000, 3000, 6))).toMatchObject({ width: 3000, height: 4000 })
  })

  it('o que não é imagem (ou é SVG) fica de fora', () => {
    expect(sniffImage(new TextEncoder().encode('%PDF-1.7'))).toBeNull()
    expect(
      sniffImage(
        new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>')
      )
    ).toBeNull()
  })
})

describe('arquivos escolhidos ou soltos', () => {
  it('só arquivos de verdade, com caminho completo, viram ficha; a ficha vale uma vez', async () => {
    const picks = createPicks()
    const real = files.sample('nota.txt', 'abc')
    const picked = await picks.register([
      real,
      path.dirname(real),
      'relativo.txt',
      path.join(files.dir, 'nao-existe.txt')
    ])
    expect(picked).toEqual([{ token: expect.any(String), name: 'nota.txt', size: 3 }])
    expect(picks.take([picked[0]!.token])).toEqual([{ path: real, name: 'nota.txt', size: 3 }])
    expect(() => picks.take([picked[0]!.token])).toThrow(/Escolha o arquivo de novo/)
  })

  it('as fichas mais antigas saem quando passam do limite', async () => {
    const picks = createPicks(2)
    const [a] = await picks.register([files.sample('a.txt', 'a')])
    await picks.register([files.sample('b.txt', 'b'), files.sample('c.txt', 'c')])
    expect(() => picks.take([a!.token])).toThrow(/Escolha o arquivo de novo/)
  })
})

describe('arquivos sem uso (DAD-08)', () => {
  it('na abertura, sai o que nada usa; ficam os de anexo, capa e fundo, e o que não é do Mello', async () => {
    const boardId = boards.create(t.db, 'Casa', NOW).id
    const listId = boards.get(t.db, boardId).lists[0]!.id
    const cardId = cards.create(t.db, listId, 'Viagem', NOW).id
    await attachments.add(
      t.db,
      files.store,
      cardId,
      [{ path: files.sample('a.pdf', 'anexo'), name: 'a.pdf' }],
      NOW
    )
    await attachments.uploadCover(t.db, files.store, cardId, files.sample('capa.png', PNG_1X1), NOW)
    const background = await storeFile(
      t.db,
      files.store,
      files.sample('fundo.jpg', jpegHeader(1600, 1000, 1)),
      NOW
    )
    t.sqlite
      .prepare("UPDATE board SET bg_kind = 'image', bg_value = ? WHERE id = ?")
      .run(background.id, boardId)
    // Anexo removido e imagem enviada no editor de fundo sem aplicar: ficaram sem uso.
    await attachments.add(
      t.db,
      files.store,
      cardId,
      [{ path: files.sample('b.txt', 'removido'), name: 'b.txt' }],
      NOW
    )
    const removed = cards.get(t.db, cardId).attachments.find((item) => item.name === 'b.txt')!
    attachments.remove(t.db, removed.id, NOW)
    await storeFile(t.db, files.store, files.sample('outro.png', 'nao aplicada'), NOW)
    fs.writeFileSync(path.join(files.dir, `${'e'.repeat(64)}.png`), 'sem registro')
    fs.writeFileSync(path.join(files.dir, '6f1c2b2e.tmp'), 'cópia que caiu no meio')
    fs.writeFileSync(path.join(files.dir, 'leia-me.txt'), 'não é do Mello')

    expect(cleanUnusedFiles(t.db, files.dir)).toEqual({ removed: 4 })
    expect(files.stored().sort()).toEqual(
      [`${sha('anexo')}.pdf`, `${sha(PNG_1X1)}.png`, `${background.id}.jpg`, 'leia-me.txt'].sort()
    )
    expect(t.db.select({ id: file.id }).from(file).all()).toHaveLength(3)
  })
})
