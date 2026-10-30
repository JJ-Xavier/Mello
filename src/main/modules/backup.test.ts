import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openSqlite, type Sqlite } from '../db/client'
import { applyMigrations, migrations, pendingMigrations } from '../db/migrate'
import {
  backupFileName,
  checkBackup,
  cleanMirror,
  createBackup,
  listBackups,
  MIRROR_DIR,
  restoreFrom,
  rotateBackups,
  storedNames
} from './backup'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime()

let dir: string
let folder: string
let filesDir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mello-backup-'))
  folder = path.join(dir, 'backups')
  filesDir = path.join(dir, 'arquivos')
  fs.mkdirSync(filesDir)
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

// Um banco do Mello de verdade (migrado) num arquivo, com os arquivos guardados dados.
function melloDb(name: string, stored: string[] = []): Sqlite {
  const sqlite = openSqlite(path.join(dir, name))
  applyMigrations(sqlite, pendingMigrations(sqlite), 0)
  for (const id of stored) {
    sqlite
      .prepare(
        "INSERT INTO file (id, ext, mime, size, created_at) VALUES (?, 'png', 'image/png', 3, 0)"
      )
      .run(id)
    fs.writeFileSync(path.join(filesDir, `${id}.png`), id.slice(0, 3))
  }
  return sqlite
}

describe('backup (DAD-02, DAD-05)', () => {
  it('DAD-02: o nome é mello-AAAA-MM-DD_HHmm.db no horário local', () => {
    expect(backupFileName(new Date(2026, 0, 5, 7, 3).getTime())).toBe('mello-2026-01-05_0703.db')
    expect(backupFileName(new Date(2026, 11, 31, 23, 59).getTime())).toBe(
      'mello-2026-12-31_2359.db'
    )
  })

  it('DAD-02: o backup é uma cópia consistente do banco aberto, num arquivo só', async () => {
    const sqlite = openSqlite(path.join(dir, 'mello.db'))
    sqlite.exec("CREATE TABLE nota (texto TEXT); INSERT INTO nota VALUES ('oi')")
    const target = await createBackup(sqlite, folder, Date.now())
    sqlite.close()

    // Sem -wal ao lado: o backup pode ser copiado ou sincronizado sozinho.
    expect(fs.readdirSync(folder)).toEqual([path.basename(target)])
    const copia = new Database(target, { readonly: true })
    expect(copia.pragma('journal_mode', { simple: true })).toBe('delete')
    expect(copia.prepare('SELECT texto FROM nota').all()).toEqual([{ texto: 'oi' }])
    copia.close()
  })

  it('dois backups no mesmo minuto não se sobrescrevem', async () => {
    const sqlite = openSqlite(path.join(dir, 'mello.db'))
    const now = new Date(2026, 9, 21, 9, 0).getTime()
    const first = await createBackup(sqlite, folder, now)
    const second = await createBackup(sqlite, folder, now)
    sqlite.close()
    expect(path.basename(first)).toBe('mello-2026-10-21_0900.db')
    expect(path.basename(second)).toBe('mello-2026-10-21_0900-2.db')
  })

  it('a lista: do mais recente para o mais antigo, com o tipo e o tamanho; o resto da pasta fica de fora', async () => {
    const sqlite = melloDb('mello.db')
    await createBackup(sqlite, folder, at(19, 18), { kind: 'migration' })
    await createBackup(sqlite, folder, at(20, 9), { kind: 'open' })
    await createBackup(sqlite, folder, at(21, 14), { kind: 'hourly' })
    await createBackup(sqlite, folder, at(21, 14), { kind: 'manual' })
    sqlite.close()
    fs.writeFileSync(path.join(folder, 'mello-2026-10-22_1000.db'), 'não é um banco')
    fs.writeFileSync(path.join(folder, 'anotações.txt'), 'meu arquivo')

    const list = listBackups(folder)
    expect(list.map((item) => [item.name, item.kind])).toEqual([
      ['mello-2026-10-21_1400-2.db', 'manual'],
      ['mello-2026-10-21_1400.db', 'hourly'],
      ['mello-2026-10-20_0900.db', 'open'],
      ['mello-2026-10-19_1800.db', 'migration']
    ])
    expect(list[0]!.at).toBe(at(21, 14))
    expect(list[0]!.size).toBe(fs.statSync(path.join(folder, list[0]!.name)).size)
    expect(listBackups(path.join(dir, 'não existe'))).toEqual([])
  })

  it('DAD-03: o mais recente é o último gravado, mesmo que o relógio tenha voltado', async () => {
    const sqlite = melloDb('mello.db')
    // Gravados com o relógio adiantado (o relógio de teste, ou o do Windows errado)…
    for (let day = 21; day <= 30; day++) await createBackup(sqlite, folder, at(day, 9))
    // …e um depois de o relógio voltar ao certo.
    await createBackup(sqlite, folder, at(20, 9), { kind: 'manual' })
    sqlite.close()
    expect(listBackups(folder)[0]).toMatchObject({
      name: 'mello-2026-10-20_0900.db',
      kind: 'manual'
    })
    expect(rotateBackups(folder)).toEqual(['mello-2026-10-21_0900.db'])
    expect(fs.existsSync(path.join(folder, 'mello-2026-10-20_0900.db'))).toBe(true)
  })

  it('DAD-05: os arquivos que o backup usa vão para o espelho, só os que faltam', async () => {
    const sqlite = melloDb('mello.db', [HASH_A])
    await createBackup(sqlite, folder, at(21, 9), { filesDir })
    const mirrored = path.join(folder, MIRROR_DIR, `${HASH_A}.png`)
    expect(fs.readFileSync(mirrored, 'utf8')).toBe('aaa')

    // O arquivo guardado nunca muda: o segundo backup não copia de novo.
    fs.writeFileSync(mirrored, 'já estava')
    sqlite
      .prepare(
        "INSERT INTO file (id, ext, mime, size, created_at) VALUES (?, 'png', 'image/png', 3, 0)"
      )
      .run(HASH_B)
    fs.writeFileSync(path.join(filesDir, `${HASH_B}.png`), 'bbb')
    const second = await createBackup(sqlite, folder, at(21, 10), { filesDir })
    sqlite.close()
    expect(fs.readFileSync(mirrored, 'utf8')).toBe('já estava')
    expect(fs.readdirSync(path.join(folder, MIRROR_DIR)).sort()).toEqual([
      `${HASH_A}.png`,
      `${HASH_B}.png`
    ])
    expect(storedNames(second).sort()).toEqual([`${HASH_A}.png`, `${HASH_B}.png`])
  })

  it('DAD-03: ficam os 10 mais recentes', async () => {
    const sqlite = melloDb('mello.db')
    for (let hour = 1; hour <= 12; hour++) await createBackup(sqlite, folder, at(21, hour))
    sqlite.close()
    fs.writeFileSync(path.join(folder, 'mello-2026-10-20_0900.db.parcial'), 'caiu no meio')
    expect(rotateBackups(folder)).toEqual(['mello-2026-10-21_0200.db', 'mello-2026-10-21_0100.db'])
    expect(fs.existsSync(path.join(folder, 'mello-2026-10-20_0900.db.parcial'))).toBe(false)
    const kept = listBackups(folder)
    expect(kept).toHaveLength(10)
    expect(kept.at(-1)!.name).toBe('mello-2026-10-21_0300.db')
  })

  it('DAD-08: no espelho, um arquivo só sai quando nenhum backup guardado o usa', async () => {
    const sqlite = melloDb('mello.db', [HASH_A, HASH_B])
    await createBackup(sqlite, folder, at(21, 9), { filesDir })
    sqlite.prepare('DELETE FROM file WHERE id = ?').run(HASH_A)
    await createBackup(sqlite, folder, at(21, 10), { filesDir })
    sqlite.close()
    fs.writeFileSync(path.join(folder, MIRROR_DIR, `${HASH_A}.png.parcial`), 'sobra')
    fs.writeFileSync(path.join(folder, MIRROR_DIR, 'leia-me.txt'), 'meu')

    // O backup das 9h ainda usa o A.
    expect(cleanMirror(folder)).toBe(1)
    expect(fs.existsSync(path.join(folder, MIRROR_DIR, `${HASH_A}.png`))).toBe(true)

    rotateBackups(folder, 1)
    expect(cleanMirror(folder)).toBe(1)
    expect(fs.readdirSync(path.join(folder, MIRROR_DIR)).sort()).toEqual([
      `${HASH_B}.png`,
      'leia-me.txt'
    ])
  })

  it('um backup de antes da etapa 10 (modo WAL) é lido sem deixar -wal e -shm na pasta', async () => {
    const sqlite = melloDb('mello.db', [HASH_A])
    fs.mkdirSync(folder)
    const legacy = path.join(folder, 'mello-2026-10-20_0900.db')
    await sqlite.backup(legacy)
    sqlite.close()
    expect(listBackups(folder)[0]!.kind).toBe('migration')
    expect(storedNames(legacy)).toEqual([`${HASH_A}.png`])
    expect(fs.readdirSync(folder)).toEqual(['mello-2026-10-20_0900.db'])
  })
})

describe('restaurar (DAD-06)', () => {
  it('confere o arquivo antes: danificado, de outro programa ou de uma versão mais nova não serve', async () => {
    fs.mkdirSync(folder)
    const junk = path.join(folder, 'mello-2026-10-20_0900.db')
    fs.writeFileSync(junk, 'não é um banco')
    expect(() => checkBackup(junk)).toThrow('danificado ou não é do Mello')

    const other = openSqlite(path.join(dir, 'outro.db'))
    other.exec('CREATE TABLE nota (texto TEXT)')
    const otherBackup = await createBackup(other, folder, at(20, 10))
    other.close()
    expect(() => checkBackup(otherBackup)).toThrow('danificado ou não é do Mello')

    const sqlite = melloDb('mello.db')
    const good = await createBackup(sqlite, folder, at(20, 11))
    sqlite.close()
    expect(() => checkBackup(good)).not.toThrow()
    expect(() => checkBackup(good, migrations.slice(1))).toThrow('versão mais nova do Mello')
  })

  it('troca o banco pelo backup e traz do espelho os arquivos que faltam', async () => {
    const sqlite = melloDb('mello.db', [HASH_A])
    sqlite.exec("INSERT INTO setting (key, value) VALUES ('calendar.weekStart', '\"monday\"')")
    const backup = await createBackup(sqlite, folder, at(20, 9), { filesDir })
    sqlite.exec('UPDATE setting SET value = \'"sunday"\'')
    sqlite.close()
    fs.rmSync(path.join(filesDir, `${HASH_A}.png`))
    // Um -wal que tenha sobrado do banco antigo não pode ser aplicado por cima do backup.
    fs.writeFileSync(path.join(dir, 'mello.db-wal'), 'sobra')

    await restoreFrom({
      backupFile: backup,
      dbFile: path.join(dir, 'mello.db'),
      filesDir,
      mirrorDir: path.join(folder, MIRROR_DIR)
    })

    expect(fs.existsSync(path.join(dir, 'mello.db-wal'))).toBe(false)
    const restored = openSqlite(path.join(dir, 'mello.db'))
    expect(restored.prepare('SELECT value FROM setting').pluck().get()).toBe('"monday"')
    restored.close()
    expect(fs.readFileSync(path.join(filesDir, `${HASH_A}.png`), 'utf8')).toBe('aaa')
  })
})
