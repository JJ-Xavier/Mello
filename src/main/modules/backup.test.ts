import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openSqlite } from '../db/client'
import { backupFileName, createBackup } from './backup'

describe('backup', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mello-backup-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('DAD-02: o nome é mello-AAAA-MM-DD_HHmm.db no horário local', () => {
    expect(backupFileName(new Date(2026, 0, 5, 7, 3).getTime())).toBe('mello-2026-01-05_0703.db')
    expect(backupFileName(new Date(2026, 11, 31, 23, 59).getTime())).toBe(
      'mello-2026-12-31_2359.db'
    )
  })

  it('DAD-02: o backup é uma cópia consistente do banco aberto', async () => {
    const sqlite = openSqlite(path.join(dir, 'mello.db'))
    sqlite.exec("CREATE TABLE nota (texto TEXT); INSERT INTO nota VALUES ('oi')")
    const target = await createBackup(sqlite, path.join(dir, 'backups'), Date.now())
    sqlite.close()

    const copia = openSqlite(target)
    expect(copia.prepare('SELECT texto FROM nota').all()).toEqual([{ texto: 'oi' }])
    copia.close()
  })

  it('dois backups no mesmo minuto não se sobrescrevem', async () => {
    const sqlite = openSqlite(path.join(dir, 'mello.db'))
    const now = new Date(2026, 9, 21, 9, 0).getTime()
    const folder = path.join(dir, 'backups')
    const first = await createBackup(sqlite, folder, now)
    const second = await createBackup(sqlite, folder, now)
    sqlite.close()
    expect(path.basename(first)).toBe('mello-2026-10-21_0900.db')
    expect(path.basename(second)).toBe('mello-2026-10-21_0900-2.db')
  })
})
