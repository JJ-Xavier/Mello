// Aplica as migrações geradas pelo drizzle-kit (src/main/db/migrations).
//
// Os arquivos .sql entram no próprio código do app no build (import.meta.glob), então o app
// instalado não depende de nenhuma pasta de migrações ao lado do executável. O controle do que já
// foi aplicado fica na tabela _migrations.
import { AppError } from '../../shared/result'
import type { Sqlite } from './client'
import journal from './migrations/meta/_journal.json'

export interface Migration {
  tag: string
  sql: string
}

const files = import.meta.glob<string>('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true
})

export const migrations: Migration[] = journal.entries.map((entry) => {
  const sql = files[`./migrations/${entry.tag}.sql`]
  if (sql === undefined) throw new Error(`Migração ${entry.tag} não encontrada.`)
  return { tag: entry.tag, sql }
})

function ensureMigrationsTable(sqlite: Sqlite): void {
  sqlite.exec(
    'CREATE TABLE IF NOT EXISTS _migrations (tag TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)'
  )
}

export function appliedMigrations(sqlite: Sqlite): string[] {
  ensureMigrationsTable(sqlite)
  const rows = sqlite.prepare('SELECT tag FROM _migrations ORDER BY tag').all() as { tag: string }[]
  return rows.map((row) => row.tag)
}

// As migrações que ainda faltam aplicar. Recusa um banco que tenha migrações que este app não
// conhece (banco criado por uma versão mais nova do Mello), para não estragar os dados.
export function pendingMigrations(sqlite: Sqlite, known: Migration[] = migrations): Migration[] {
  const applied = new Set(appliedMigrations(sqlite))
  const knownTags = new Set(known.map((migration) => migration.tag))
  const unknown = [...applied].filter((tag) => !knownTags.has(tag))
  if (unknown.length > 0) {
    throw new AppError(
      'CONFLICT',
      `Este banco foi criado por uma versão mais nova do Mello (${unknown.join(', ')}).`
    )
  }
  return known.filter((migration) => !applied.has(migration.tag))
}

// Aplica tudo numa transação só: ou o banco fica com todas as migrações, ou com nenhuma.
// As chaves estrangeiras ficam desligadas durante a troca (o SQLite ignora o PRAGMA dentro de uma
// transação) e são conferidas antes do commit, como manda a documentação do SQLite para mudanças
// de schema que recriam tabelas.
export function applyMigrations(sqlite: Sqlite, pending: Migration[], now: number): void {
  if (pending.length === 0) return
  ensureMigrationsTable(sqlite)
  const record = sqlite.prepare('INSERT INTO _migrations (tag, applied_at) VALUES (?, ?)')
  sqlite.pragma('foreign_keys = OFF')
  try {
    sqlite.transaction(() => {
      for (const migration of pending) {
        for (const statement of migration.sql.split('--> statement-breakpoint')) {
          if (statement.trim() !== '') sqlite.exec(statement)
        }
        record.run(migration.tag, now)
      }
      const violations = sqlite.pragma('foreign_key_check') as unknown[]
      if (violations.length > 0) {
        throw new Error(`A migração deixaria ${violations.length} referência(s) quebrada(s).`)
      }
    })()
  } finally {
    sqlite.pragma('foreign_keys = ON')
  }
}
