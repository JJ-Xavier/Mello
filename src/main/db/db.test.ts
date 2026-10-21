import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openSqlite, type Sqlite } from './client'
import { appliedMigrations, applyMigrations, migrations, pendingMigrations } from './migrate'
import { openDatabase } from './open'

const NOW = new Date(2026, 9, 21, 14, 30).getTime()

const TABLES = [
  'activity',
  'attachment',
  'board',
  'card',
  'card_label',
  'checklist',
  'checklist_item',
  'file',
  'label',
  'list',
  'recurrence',
  'recurrence_occurrence',
  'setting'
]

function tableNames(sqlite: Sqlite): string[] {
  const rows = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all() as { name: string }[]
  return rows.map((row) => row.name)
}

function migrated(): Sqlite {
  const sqlite = openSqlite(':memory:')
  applyMigrations(sqlite, pendingMigrations(sqlite), NOW)
  return sqlite
}

function insertBoard(sqlite: Sqlite, id = 'b1'): void {
  sqlite
    .prepare(
      "INSERT INTO board (id, title, position, bg_tone, created_at, updated_at) VALUES (?, 'Pessoal', 'a0', '#d8bd9b', ?, ?)"
    )
    .run(id, NOW, NOW)
}

function insertList(sqlite: Sqlite, id: string, boardId: string): void {
  sqlite
    .prepare(
      "INSERT INTO list (id, board_id, title, position, created_at, updated_at) VALUES (?, ?, 'A fazer', 'a0', ?, ?)"
    )
    .run(id, boardId, NOW, NOW)
}

describe('migrações', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mello-db-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('a migração inicial cria todas as tabelas num banco vazio', () => {
    const sqlite = migrated()
    expect(tableNames(sqlite)).toEqual(['_migrations', ...TABLES])
    expect(appliedMigrations(sqlite)).toEqual(migrations.map((m) => m.tag))
    sqlite.close()
  })

  it('reabrir o banco não reaplica nada e mantém os dados', async () => {
    const file = path.join(dir, 'mello.db')
    const first = await openDatabase({ file, backupsDir: path.join(dir, 'backups'), now: NOW })
    expect(first.applied).toEqual(migrations.map((m) => m.tag))
    insertBoard(first.sqlite)
    first.sqlite.close()

    const second = await openDatabase({ file, backupsDir: path.join(dir, 'backups'), now: NOW })
    expect(second.applied).toEqual([])
    expect(second.backupPath).toBeNull()
    expect(second.sqlite.prepare('SELECT count(*) AS n FROM board').get()).toEqual({ n: 1 })
    second.sqlite.close()
  })

  it('o banco novo é criado no arquivo, em modo WAL', async () => {
    const file = path.join(dir, 'mello.db')
    const opened = await openDatabase({ file, backupsDir: path.join(dir, 'backups'), now: NOW })
    expect(fs.existsSync(file)).toBe(true)
    expect(opened.sqlite.pragma('journal_mode', { simple: true })).toBe('wal')
    opened.sqlite.close()
  })

  it('DAD-01: faz backup antes de migrar um banco que já tem dados', async () => {
    const file = path.join(dir, 'mello.db')
    const backupsDir = path.join(dir, 'backups')
    const first = await openDatabase({ file, backupsDir, now: NOW })
    insertBoard(first.sqlite)
    first.sqlite.close()

    const nova = { tag: '9999_teste', sql: 'CREATE TABLE teste (id TEXT PRIMARY KEY NOT NULL)' }
    const second = await openDatabase({
      file,
      backupsDir,
      now: NOW,
      known: [...migrations, nova]
    })
    expect(second.applied).toEqual(['9999_teste'])
    expect(second.backupPath).not.toBeNull()

    // O backup é o banco de antes da migração: tem o quadro e não tem a tabela nova.
    const backup = openSqlite(second.backupPath!)
    expect(backup.prepare('SELECT count(*) AS n FROM board').get()).toEqual({ n: 1 })
    expect(tableNames(backup)).not.toContain('teste')
    backup.close()
    second.sqlite.close()
  })

  it('um banco novo não gera backup', async () => {
    const opened = await openDatabase({
      file: path.join(dir, 'mello.db'),
      backupsDir: path.join(dir, 'backups'),
      now: NOW
    })
    expect(opened.backupPath).toBeNull()
    expect(fs.existsSync(path.join(dir, 'backups'))).toBe(false)
    opened.sqlite.close()
  })

  it('uma migração com erro não aplica nada (transação)', () => {
    const sqlite = migrated()
    const quebradas = [
      { tag: '9998_ok', sql: 'CREATE TABLE ok (id TEXT)' },
      { tag: '9999_erro', sql: 'CREATE TABLE erro (id TEXT);--> statement-breakpoint\nSELEC 1' }
    ]
    expect(() => applyMigrations(sqlite, quebradas, NOW)).toThrow()
    expect(tableNames(sqlite)).not.toContain('ok')
    expect(appliedMigrations(sqlite)).toEqual(migrations.map((m) => m.tag))
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
    sqlite.close()
  })

  it('recusa um banco criado por uma versão mais nova do app', () => {
    const sqlite = migrated()
    sqlite
      .prepare('INSERT INTO _migrations (tag, applied_at) VALUES (?, ?)')
      .run('9999_futuro', NOW)
    expect(() => pendingMigrations(sqlite)).toThrow(/versão mais nova/)
    sqlite.close()
  })
})

describe('conexão', () => {
  it('liga as chaves estrangeiras', () => {
    const sqlite = migrated()
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(() => insertList(sqlite, 'l1', 'quadro-que-nao-existe')).toThrow(/FOREIGN KEY/)
    sqlite.close()
  })

  it('excluir um quadro apaga as listas dele (ON DELETE CASCADE)', () => {
    const sqlite = migrated()
    insertBoard(sqlite)
    insertList(sqlite, 'l1', 'b1')
    sqlite.prepare("DELETE FROM board WHERE id = 'b1'").run()
    expect(sqlite.prepare('SELECT count(*) AS n FROM list').get()).toEqual({ n: 0 })
    sqlite.close()
  })

  it('a prioridade do card só aceita 1 a 5 ou nada', () => {
    const sqlite = migrated()
    insertBoard(sqlite)
    insertList(sqlite, 'l1', 'b1')
    const insert = sqlite.prepare(
      "INSERT INTO card (id, list_id, title, position, priority, last_activity_at, created_at, updated_at) VALUES (?, 'l1', 'Card', 'a0', ?, ?, ?, ?)"
    )
    expect(() => insert.run('c1', 3, NOW, NOW, NOW)).not.toThrow()
    expect(() => insert.run('c2', null, NOW, NOW, NOW)).not.toThrow()
    expect(() => insert.run('c3', 0, NOW, NOW, NOW)).toThrow(/CHECK/)
    expect(() => insert.run('c4', 6, NOW, NOW, NOW)).toThrow(/CHECK/)
    sqlite.close()
  })

  it('BUS-01: a função unaccent ignora acentos e cedilha', () => {
    const sqlite = migrated()
    insertBoard(sqlite)
    sqlite.prepare("UPDATE board SET title = 'Ação Útil' WHERE id = 'b1'").run()
    const found = sqlite
      .prepare('SELECT id FROM board WHERE lower(unaccent(title)) LIKE lower(unaccent(?))')
      .all('%acao util%')
    expect(found).toEqual([{ id: 'b1' }])
    expect(sqlite.prepare('SELECT unaccent(NULL) AS v').get()).toEqual({ v: null })
    sqlite.close()
  })
})
