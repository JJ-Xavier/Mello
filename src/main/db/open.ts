import { createBackup, rotateBackups } from '../modules/backup'
import { backupTarget } from '../modules/data'
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
  // A pasta padrão dos backups; a escolhida nas Configurações vale se estiver disponível (DAD-04).
  backupsDir: string
  // A pasta de arquivos do app, para o espelho do backup (DAD-05).
  filesDir?: string
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
    const db = createDb(sqlite)
    let backupPath: string | null = null
    if (pending.length > 0 && appliedMigrations(sqlite).length > 0) {
      const { folder } = backupTarget(db, options.backupsDir)
      backupPath = await createBackup(sqlite, folder, options.now, {
        kind: 'migration',
        filesDir: options.filesDir
      })
      rotateBackups(folder)
    }
    applyMigrations(sqlite, pending, options.now)
    return { sqlite, db, applied: pending.map((migration) => migration.tag), backupPath }
  } catch (error) {
    sqlite.close()
    throw error
  }
}
