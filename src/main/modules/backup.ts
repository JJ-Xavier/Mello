// Backups do banco (DAD-01 a DAD-06) e o espelho dos arquivos (DAD-05, DAD-08). Só arquivos e
// SQLite, sem Electron: os testes usam pastas temporárias.
//
// Cada backup é um banco completo num arquivo só: a cópia sai da API de backup do SQLite (DAD-02)
// e passa para o modo de diário comum (journal_mode = DELETE), sem -wal ao lado. O tipo do backup
// (ao abrir, de hora em hora…) fica no user_version da própria cópia, o número que o SQLite reserva
// ao app no cabeçalho do arquivo (bytes 60 a 63); a lista lê o cabeçalho sem abrir o banco.
// Os arquivos que o backup usa (anexos, fundos e capas) ficam em <pasta>\arquivos, com o mesmo
// nome da pasta do app (o hash), então só os que faltam são copiados.
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { BACKUP_NAME, type BackupItem, type BackupKind } from '../../shared/ipc/data'
import { AppError } from '../../shared/result'
import type { Sqlite } from '../db/client'
import { migrations, type Migration } from '../db/migrate'
import { STORED_NAME } from './files'

export const BACKUP_KEEP = 10
export const MIRROR_DIR = 'arquivos'
// Cópia ainda não terminada: só ganha o nome final no fim, e a que sobrar de uma queda sai depois.
const PARTIAL = '.parcial'

const KIND_CODES: Record<BackupKind, number> = {
  open: 1,
  hourly: 2,
  manual: 3,
  migration: 4,
  restore: 5
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

// mello-AAAA-MM-DD_HHmm.db, no horário local (DAD-02).
export function backupFileName(now: number): string {
  const d = new Date(now)
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return `mello-${date}_${pad(d.getHours())}${pad(d.getMinutes())}.db`
}

// O horário do nome (local) e a ordem dentro do minuto (o -2 vem depois do sem número).
export function parseBackupName(name: string): { at: number; order: number } | null {
  const match = BACKUP_NAME.exec(name)
  if (!match) return null
  const [year, month, day, hour, minute, order] = match.slice(1).map(Number)
  return {
    at: new Date(year!, month! - 1, day!, hour!, minute!).getTime(),
    order: Number.isNaN(order) ? 1 : order!
  }
}

// O cabeçalho de 100 bytes do SQLite: null se o arquivo não for um banco.
function readHeader(file: string): { userVersion: number; wal: boolean } | null {
  const header = Buffer.alloc(100)
  let fd: number | undefined
  try {
    fd = fs.openSync(file, 'r')
    if (fs.readSync(fd, header, 0, 100, 0) < 100) return null
  } catch {
    return null
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
  if (header.toString('latin1', 0, 16) !== 'SQLite format 3\0') return null
  return { userVersion: header.readUInt32BE(60), wal: header[18] === 2 }
}

// Os backups de antes da etapa 10 têm user_version 0: todos foram feitos antes de migrar.
function kindOf(code: number): BackupKind {
  const kinds = Object.keys(KIND_CODES) as BackupKind[]
  return kinds.find((kind) => KIND_CODES[kind] === code) ?? 'migration'
}

// Os backups da pasta, do mais recente para o mais antigo. Só os arquivos com o nome da DAD-02 que
// são bancos SQLite; o resto da pasta não é do Mello e fica como está.
// "Mais recente" é o último gravado (a data de modificação do arquivo), e não o horário do nome:
// se o relógio voltar (o do Windows acertado, ou o relógio de teste), o backup novo, com um nome
// mais antigo, não pode ser o primeiro a sair na rotação. Empate: o horário do nome.
export function listBackups(folder: string): BackupItem[] {
  let names: string[]
  try {
    names = fs.readdirSync(folder)
  } catch {
    return []
  }
  const found: (BackupItem & { order: number; written: number })[] = []
  for (const name of names) {
    const parsed = parseBackupName(name)
    const file = path.join(folder, name)
    const header = parsed && readHeader(file)
    if (!parsed || !header) continue
    const { size, mtimeMs } = fs.statSync(file)
    const kind = kindOf(header.userVersion)
    found.push({ name, at: parsed.at, order: parsed.order, written: mtimeMs, kind, size })
  }
  found.sort((a, b) => b.written - a.written || b.at - a.at || b.order - a.order)
  return found.map(({ name, at, kind, size }) => ({ name, at, kind, size }))
}

// Abre um backup só para ler. Um backup de antes da etapa 10 ainda está no modo WAL e passa para o
// modo comum antes, para a leitura não deixar -wal e -shm na pasta (o conteúdo não muda).
function openBackup(file: string): Database.Database {
  if (readHeader(file)?.wal) {
    const writable = new Database(file, { fileMustExist: true })
    writable.pragma('journal_mode = DELETE')
    writable.close()
  }
  return new Database(file, { readonly: true, fileMustExist: true })
}

// Os arquivos guardados que um banco conhece (tabela file), pelo nome na pasta: <hash>.<ext>.
function storedNamesOf(db: Database.Database): string[] {
  const rows = db.prepare('SELECT id, ext FROM file').all() as { id: string; ext: string }[]
  return rows.map((row) => `${row.id}.${row.ext}`)
}

export function storedNames(backupFile: string): string[] {
  const db = openBackup(backupFile)
  try {
    return storedNamesOf(db)
  } finally {
    db.close()
  }
}

// Copia de uma pasta para a outra os arquivos que faltam lá. Um arquivo que sumiu da origem fica
// de fora: não há o que copiar.
export async function copyMissing(names: string[], from: string, to: string): Promise<void> {
  await fs.promises.mkdir(to, { recursive: true })
  for (const name of names) {
    const target = path.join(to, name)
    const source = path.join(from, name)
    if (fs.existsSync(target) || !fs.existsSync(source)) continue
    await fs.promises.copyFile(source, target + PARTIAL)
    await fs.promises.rename(target + PARTIAL, target)
  }
}

// Gera o backup pela API do SQLite, mesmo com o banco aberto (DAD-02). Com filesDir, os arquivos
// que a cópia usa vão para o espelho antes de ela ganhar o nome final (DAD-05): um backup na lista
// sempre tem os arquivos dele. Dois backups no mesmo minuto não se sobrescrevem: o segundo ganha o
// sufixo -2, -3…
export async function createBackup(
  sqlite: Sqlite,
  folder: string,
  now: number,
  options: { kind?: BackupKind; filesDir?: string } = {}
): Promise<string> {
  fs.mkdirSync(folder, { recursive: true })
  const base = backupFileName(now).replace(/\.db$/, '')
  let target = path.join(folder, `${base}.db`)
  for (let n = 2; fs.existsSync(target) || fs.existsSync(target + PARTIAL); n++) {
    target = path.join(folder, `${base}-${n}.db`)
  }
  const temp = target + PARTIAL
  try {
    await sqlite.backup(temp)
    const copy = new Database(temp)
    let names: string[] = []
    try {
      copy.pragma('journal_mode = DELETE')
      copy.pragma(`user_version = ${KIND_CODES[options.kind ?? 'manual']}`)
      if (options.filesDir) names = storedNamesOf(copy)
    } finally {
      copy.close()
    }
    if (options.filesDir) await copyMissing(names, options.filesDir, path.join(folder, MIRROR_DIR))
    fs.renameSync(temp, target)
  } catch (error) {
    fs.rmSync(temp, { force: true })
    throw error
  }
  return target
}

// DAD-03: só os 10 mais recentes ficam. Devolve os nomes apagados. Sai também a cópia provisória
// de um backup que caiu no meio (os backups são feitos um por vez, então nenhum está em andamento).
export function rotateBackups(folder: string, keep = BACKUP_KEEP): string[] {
  const old = listBackups(folder).slice(keep)
  for (const item of old) fs.rmSync(path.join(folder, item.name), { force: true })
  for (const name of fs.readdirSync(folder)) {
    if (name.endsWith(PARTIAL) && BACKUP_NAME.test(name.slice(0, -PARTIAL.length))) {
      fs.rmSync(path.join(folder, name), { force: true })
    }
  }
  return old.map((item) => item.name)
}

// DAD-08: no espelho, um arquivo só sai quando nenhum dos backups guardados o usa. Se um backup
// não puder ser lido, nada sai (o erro sobe).
export function cleanMirror(folder: string): number {
  const mirror = path.join(folder, MIRROR_DIR)
  let names: string[]
  try {
    names = fs.readdirSync(mirror)
  } catch {
    return 0
  }
  const used = new Set<string>()
  for (const item of listBackups(folder)) {
    for (const name of storedNames(path.join(folder, item.name))) used.add(name)
  }
  let removed = 0
  for (const name of names) {
    const unused = STORED_NAME.test(name) && !used.has(name)
    if (unused || name.endsWith(PARTIAL)) {
      fs.rmSync(path.join(mirror, name), { force: true })
      removed++
    }
  }
  return removed
}

// DAD-06: confere, antes de mexer em qualquer coisa, se o arquivo é um backup que esta versão abre:
// um banco SQLite íntegro, com as migrações do Mello e nenhuma de uma versão mais nova.
export function checkBackup(file: string, known: Migration[] = migrations): void {
  const damaged = new AppError(
    'INVALID_INPUT',
    'Este backup não pode ser restaurado: o arquivo está danificado ou não é do Mello.'
  )
  if (!readHeader(file)) throw damaged
  let tags: string[]
  try {
    const db = openBackup(file)
    try {
      if (db.pragma('quick_check', { simple: true }) !== 'ok') throw damaged
      const rows = db.prepare('SELECT tag FROM _migrations').all() as { tag: string }[]
      tags = rows.map((row) => row.tag)
    } finally {
      db.close()
    }
  } catch {
    throw damaged
  }
  const knownTags = new Set(known.map((migration) => migration.tag))
  if (tags.length === 0) throw damaged
  if (tags.some((tag) => !knownTags.has(tag))) {
    throw new AppError('CONFLICT', 'Este backup é de uma versão mais nova do Mello.')
  }
}

// DAD-06: traz do espelho os arquivos que faltam na pasta do app e troca o banco pelo backup. O
// banco em uso precisa estar fechado. O -wal que sobrar do banco antigo sai antes da troca: o
// SQLite o aplicaria por cima do backup.
export async function restoreFrom(options: {
  backupFile: string
  dbFile: string
  filesDir: string
  mirrorDir: string
}): Promise<void> {
  const { backupFile, dbFile, filesDir, mirrorDir } = options
  await copyMissing(storedNames(backupFile), mirrorDir, filesDir)
  const temp = `${dbFile}.restaurando`
  await fs.promises.copyFile(backupFile, temp)
  for (const suffix of ['-wal', '-shm']) fs.rmSync(dbFile + suffix, { force: true })
  await fs.promises.rename(temp, dbFile)
}
