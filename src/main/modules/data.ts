// Dados e backup (DAD, etapa 10): a pasta de backup (DAD-04), o backup automático (DAD-01), a
// lista, restaurar (DAD-06), exportar (DAD-07) e apagar tudo (DAD-09). Sem Electron: fechar o
// banco, reiniciar o app e os avisos na tela chegam pelas opções, e os testes passam versões
// falsas. Os backups em si ficam em backup.ts.
import fs from 'node:fs'
import path from 'node:path'
import {
  BACKUP_NAME,
  type BackupItem,
  type BackupKind,
  type BackupOverview
} from '../../shared/ipc/data'
import { AppError } from '../../shared/result'
import type { Db, Sqlite } from '../db/client'
import type { DataPaths } from '../paths'
import {
  checkBackup,
  cleanMirror,
  createBackup,
  listBackups,
  MIRROR_DIR,
  restoreFrom,
  rotateBackups
} from './backup'
import { STORED_NAME } from './files'
import * as settings from './settings'

export const BACKUP_INTERVAL = 3_600_000

export const UNAVAILABLE_NOTICE =
  'A pasta de backup escolhida não está disponível. O backup foi feito na pasta padrão.'
export const FAILED_NOTICE = 'O backup automático falhou. Os detalhes estão no log do Mello.'

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function isFolder(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory()
  } catch {
    return false
  }
}

// DAD-04: a pasta escolhida nas Configurações ou, se ela não estiver disponível (HD desligado,
// pasta apagada), a padrão.
export function backupTarget(
  db: Db,
  defaultFolder: string
): { folder: string; custom: boolean; unavailable: boolean } {
  const chosen = settings.get(db)['backup.folder']
  if (!chosen) return { folder: defaultFolder, custom: false, unavailable: false }
  const available = isFolder(chosen)
  return { folder: available ? chosen : defaultFolder, custom: true, unavailable: !available }
}

// O aviso de "mesmo disco" (NovoConfig.dc.html): o backup na mesma unidade dos dados, a não ser
// numa pasta sincronizada com a nuvem (OneDrive, Google Drive, Dropbox), que tem cópia fora daqui.
export function onSameDisk(folder: string, dataDir: string, syncFolders: string[]): boolean {
  const drive = (target: string) => path.parse(path.resolve(target)).root.toLowerCase()
  if (drive(folder) !== drive(dataDir)) return false
  return !syncFolders.some((sync) => isInside(folder, sync))
}

// O caminho para mostrar, com %APPDATA% no lugar do começo (como no protótipo).
export function displayPath(target: string, appData?: string): string {
  if (!appData || !isInside(target, appData)) return target
  return path.join('%APPDATA%', path.relative(appData, target))
}

const pad = (value: number) => String(value).padStart(2, '0')

// AAAA-MM-DD no horário local.
function stamp(now: number): string {
  const d = new Date(now)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// DAD-07: a pasta Mello-exportacao-AAAA-MM-DD (com " (2)", " (3)"… se já existir) com o dados.json
// (todas as tabelas, uma linha por registro, como estão no banco) e a subpasta arquivos.
export async function exportData(options: {
  sqlite: Sqlite
  filesDir: string
  parent: string
  now: number
  version: string
}): Promise<{ folder: string; json: string }> {
  const { sqlite, filesDir, parent, now, version } = options
  const base = path.join(parent, `Mello-exportacao-${stamp(now)}`)
  let folder = base
  for (let n = 2; fs.existsSync(folder); n++) folder = `${base} (${n})`
  const names = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_migrations' ORDER BY name"
    )
    .pluck()
    .all() as string[]
  const tables: Record<string, unknown[]> = {}
  for (const name of names) tables[name] = sqlite.prepare(`SELECT * FROM "${name}"`).all()
  const d = new Date(now)
  const data = {
    app: 'Mello',
    versao: version,
    exportadoEm: `${stamp(now)} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
    tabelas: tables
  }
  await fs.promises.mkdir(path.join(folder, 'arquivos'), { recursive: true })
  const json = path.join(folder, 'dados.json')
  await fs.promises.writeFile(json, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  const stored = tables['file'] as { id: string; ext: string }[]
  for (const name of stored.map((row) => `${row.id}.${row.ext}`)) {
    const source = path.join(filesDir, name)
    if (fs.existsSync(source))
      await fs.promises.copyFile(source, path.join(folder, 'arquivos', name))
  }
  return { folder, json }
}

// DAD-09: apaga o banco e a pasta de arquivos do app e, nas pastas de backup dadas, só os backups
// e o espelho (nomes do Mello): a pasta escolhida pode ter outras coisas suas.
export function removeEverything(options: {
  dbFile: string
  filesDir: string
  backupFolders: string[]
}): void {
  for (const suffix of ['', '-wal', '-shm', '.restaurando']) {
    fs.rmSync(options.dbFile + suffix, { force: true })
  }
  fs.rmSync(options.filesDir, { recursive: true, force: true })
  const backup = new RegExp(`${BACKUP_NAME.source.slice(0, -1)}(\\.parcial)?$`)
  for (const folder of options.backupFolders) {
    if (!isFolder(folder)) continue
    for (const name of fs.readdirSync(folder)) {
      if (backup.test(name)) fs.rmSync(path.join(folder, name), { force: true })
    }
    const mirror = path.join(folder, MIRROR_DIR)
    if (!isFolder(mirror)) continue
    for (const name of fs.readdirSync(mirror)) {
      if (STORED_NAME.test(name) || name.endsWith('.parcial')) {
        fs.rmSync(path.join(mirror, name), { force: true })
      }
    }
    if (fs.readdirSync(mirror).length === 0) fs.rmdirSync(mirror)
  }
}

export interface DataOptions {
  sqlite: Sqlite
  db: Db
  paths: DataPaths
  now: () => number
  version: string
  // Onde a janela da exportação abre (a pasta Documentos).
  exportsDefault: string
  // Pastas sincronizadas com a nuvem: backup nelas não ganha o aviso de "mesmo disco".
  syncFolders?: string[]
  // O começo dos caminhos que aparece como %APPDATA%.
  appData?: string
  // Para o agendador e fecha o banco (antes de restaurar e de apagar tudo).
  shutdown: () => void
  // Abre o app de novo, com o banco que estiver no lugar.
  restart: () => void
  // Chegou um aviso (DAD-04, falha do backup automático): a tela pega com takeNotices.
  onNotice?: () => void
  onError?: (error: unknown) => void
}

export function createData(options: DataOptions) {
  const { sqlite, db, paths, now } = options
  // Alterações no banco desde que ele abriu (SQLite): o backup de hora em hora só sai se o número
  // mudou desde o último (DAD-01).
  const totalChanges = sqlite.prepare('SELECT total_changes()').pluck()
  const hasBoards = sqlite.prepare('SELECT EXISTS (SELECT 1 FROM board)').pluck()
  let changesAtLast = totalChanges.get() as number
  let queue: Promise<unknown> = Promise.resolve()
  let warned = false
  let notices: string[] = []
  const notice = (message: string) => {
    notices = [...notices, message]
    options.onNotice?.()
  }

  const target = () => backupTarget(db, paths.backups)
  let lastAt = listBackups(target().folder)[0]?.at ?? 0

  // Um backup por vez. O horário e as alterações contam a partir de quando o backup entra na fila:
  // o agendador não enfileira outro enquanto este espera, e o que mudar até ele rodar entra nele
  // (e conta de novo para o próximo). Antes de restaurar, a rotação e a limpeza do espelho
  // esperam: o backup escolhido pode ser o mais antigo da pasta.
  function run(kind: BackupKind): Promise<BackupItem> {
    const at = now()
    lastAt = at
    changesAtLast = totalChanges.get() as number
    const task = queue.then(async () => {
      const where = target()
      if (where.unavailable && !warned) {
        warned = true
        notice(UNAVAILABLE_NOTICE)
      }
      const file = await createBackup(sqlite, where.folder, at, { kind, filesDir: paths.files })
      if (kind !== 'restore') {
        rotateBackups(where.folder)
        try {
          cleanMirror(where.folder)
        } catch (error) {
          options.onError?.(error)
        }
      }
      const name = path.basename(file)
      return listBackups(where.folder).find((item) => item.name === name)!
    })
    queue = task.catch(() => {})
    return task
  }

  async function automatic(kind: BackupKind): Promise<BackupItem | null> {
    try {
      return await run(kind)
    } catch (error) {
      options.onError?.(error)
      notice(FAILED_NOTICE)
      return null
    }
  }

  return {
    overview(): BackupOverview {
      const where = target()
      return {
        folder: displayPath(where.folder, options.appData),
        custom: where.custom,
        unavailable: where.unavailable,
        sameDisk: onSameDisk(where.folder, paths.root, options.syncFolders ?? []),
        dataFolder: displayPath(paths.root, options.appData),
        backups: listBackups(where.folder)
      }
    },

    // O caminho de verdade da pasta atual, para abrir a janela do Windows nela.
    folder: () => target().folder,
    exportsDefault: options.exportsDefault,

    backupNow: () => run('manual'),

    // Os avisos ainda não mostrados; cada um vem uma vez só.
    takeNotices(): string[] {
      const taken = notices
      notices = []
      return taken
    },

    // DAD-01: ao abrir, se o último backup tiver mais de 1 hora e houver o que guardar.
    atOpen(): Promise<BackupItem | null> {
      if (now() - lastAt <= BACKUP_INTERVAL || hasBoards.get() !== 1) return Promise.resolve(null)
      return automatic('open')
    },

    // DAD-01: de hora em hora, se o banco mudou desde o último backup.
    hourly(): Promise<BackupItem | null> {
      if (now() - lastAt < BACKUP_INTERVAL) return Promise.resolve(null)
      if (totalChanges.get() === changesAtLast) return Promise.resolve(null)
      return automatic('hourly')
    },

    // DAD-04: troca a pasta e faz um backup nela na hora. A pasta de dados do Mello não serve (o
    // espelho cairia em cima da pasta de arquivos do app); a pasta padrão volta a ser a padrão.
    async setFolder(chosen: string): Promise<void> {
      const resolved = path.resolve(chosen)
      const isDefault = path.relative(paths.backups, resolved) === ''
      if (!isDefault && isInside(resolved, paths.root)) {
        throw new AppError('INVALID_INPUT', 'Escolha uma pasta fora da pasta de dados do Mello.')
      }
      const previous = settings.get(db)['backup.folder']
      settings.set(db, 'backup.folder', isDefault ? null : resolved)
      warned = false
      try {
        await run('manual')
      } catch (error) {
        settings.set(db, 'backup.folder', previous)
        options.onError?.(error)
        throw new AppError('CONFLICT', 'Não foi possível gravar o backup nessa pasta.')
      }
    },

    // DAD-06: confere o backup, guarda o estado atual num backup, fecha o banco, troca e reinicia.
    async restore(name: string): Promise<void> {
      const folder = target().folder
      const file = path.join(folder, name)
      if (!BACKUP_NAME.test(name) || !fs.existsSync(file)) {
        throw new AppError('NOT_FOUND', 'Este backup não está mais na pasta.')
      }
      checkBackup(file)
      await run('restore')
      options.shutdown()
      try {
        await restoreFrom({
          backupFile: file,
          dbFile: paths.db,
          filesDir: paths.files,
          mirrorDir: path.join(folder, MIRROR_DIR)
        })
      } catch (error) {
        options.onError?.(error)
      } finally {
        options.restart()
      }
    },

    exportTo: (parent: string) =>
      exportData({ sqlite, filesDir: paths.files, parent, now: now(), version: options.version }),

    // DAD-09: com alsoBackups, os backups da pasta padrão e da escolhida também saem.
    deleteAll(alsoBackups: boolean): void {
      const chosen = settings.get(db)['backup.folder']
      const folders = alsoBackups ? [paths.backups, ...(chosen ? [chosen] : [])] : []
      options.shutdown()
      try {
        removeEverything({ dbFile: paths.db, filesDir: paths.files, backupFolders: folders })
      } catch (error) {
        options.onError?.(error)
      } finally {
        options.restart()
      }
    }
  }
}

export type DataService = ReturnType<typeof createData>
