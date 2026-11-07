import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { removeAccents } from '../../shared/text'
import * as schema from './schema'

export type Sqlite = Database.Database

// Abre o arquivo do banco (ou ':memory:' nos testes) com os pragmas do Mello e a função unaccent,
// usada pela busca: WHERE lower(unaccent(title)) LIKE lower(unaccent(?)).
export function openSqlite(file: string): Sqlite {
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.function('unaccent', { deterministic: true }, (value: unknown) =>
    typeof value === 'string' ? removeAccents(value) : value
  )
  return sqlite
}

export function createDb(sqlite: Sqlite) {
  return drizzle({ client: sqlite, schema })
}

export type Db = ReturnType<typeof createDb>

// Os módulos recebem o banco ou uma transação já aberta, para poderem ser combinados numa
// transação só.
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type DbOrTx = Db | Tx
