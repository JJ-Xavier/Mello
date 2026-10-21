import { createBackup } from '../modules/backup'
import { createDb, openSqlite, type Db, type Sqlite } from './client'
import {
  appliedMigrations,
  applyMigrations,
  migrations,
  pendingMigrations,
  type Migration
} from './migrate'

export interface OpenDatabaseOptions {
  file: string
  backupsDir: string
  now: number
  known?: Migration[]
}

export interface OpenedDatabase {
  sqlite: Sqlite
  db: Db
  applied: string[]
  backupPath: string | null
}

// Abre o banco e o deixa na versão do app. Se houver migração pendente num banco que já tem
// dados, faz um backup antes de migrar (DAD-01). Um banco novo não precisa de backup.
export async function openDatabase(options: OpenDatabaseOptions): Promise<OpenedDatabase> {
  const sqlite = openSqlite(options.file)
  try {
    const pending = pendingMigrations(sqlite, options.known ?? migrations)
    let backupPath: string | null = null
    if (pending.length > 0 && appliedMigrations(sqlite).length > 0) {
      backupPath = await createBackup(sqlite, options.backupsDir, options.now)
    }
    applyMigrations(sqlite, pending, options.now)
    return {
      sqlite,
      db: createDb(sqlite),
      applied: pending.map((migration) => migration.tag),
      backupPath
    }
  } catch (error) {
    sqlite.close()
    throw error
  }
}
