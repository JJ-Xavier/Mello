import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HOUR_MS } from '../../shared/ipc/dev'
import { createDb, openSqlite, type Db, type Sqlite } from '../db/client'
import { applyMigrations, pendingMigrations } from '../db/migrate'
import { dataPaths, ensureDataFolders, type DataPaths } from '../paths'
import { listBackups, MIRROR_DIR } from './backup'
import * as boards from './boards'
import {
  createData,
  displayPath,
  exportData,
  FAILED_NOTICE,
  onSameDisk,
  removeEverything,
  UNAVAILABLE_NOTICE
} from './data'
import * as settings from './settings'

const HASH = 'c'.repeat(64)
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime()

let root: string
let paths: DataPaths
let sqlite: Sqlite
let db: Db
let now: number
let life: { shutdowns: number; restarts: number; notices: number }

function open() {
  sqlite = openSqlite(paths.db)
  applyMigrations(sqlite, pendingMigrations(sqlite), 0)
  db = createDb(sqlite)
}

const service = () =>
  createData({
    sqlite,
    db,
    paths,
    now: () => now,
    version: '0.10.0',
    exportsDefault: path.join(root, 'Documentos'),
    appData: root,
    shutdown: () => {
      life.shutdowns++
      sqlite.close()
    },
    restart: () => life.restarts++,
    onNotice: () => life.notices++
  })

// Um arquivo guardado de verdade, usado como fundo do quadro.
function withStoredFile(boardId: string) {
  sqlite
    .prepare(
      "INSERT INTO file (id, ext, mime, size, created_at) VALUES (?, 'png', 'image/png', 3, 0)"
    )
    .run(HASH)
  sqlite.prepare("UPDATE board SET bg_kind = 'image', bg_value = ? WHERE id = ?").run(HASH, boardId)
  fs.writeFileSync(path.join(paths.files, `${HASH}.png`), 'ccc')
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mello-dados-'))
  paths = dataPaths(path.join(root, 'Mello'))
  ensureDataFolders(paths)
  open()
  now = at(21, 9)
  life = { shutdowns: 0, restarts: 0, notices: 0 }
})

afterEach(() => {
  if (sqlite.open) sqlite.close()
  fs.rmSync(root, { recursive: true, force: true })
})

describe('backup automático (DAD-01)', () => {
  it('ao abrir: só se o último tiver mais de 1 hora, e só com algo para guardar', async () => {
    expect(await service().atOpen()).toBeNull()
    boards.create(db, 'Casa', now)
    const first = await service().atOpen()
    expect(first).toMatchObject({ name: 'mello-2026-10-21_0900.db', kind: 'open' })

    now += HOUR_MS
    expect(await service().atOpen()).toBeNull()
    now += 1
    expect((await service().atOpen())?.kind).toBe('open')
  })

  it('de hora em hora, só se o banco mudou desde o último backup', async () => {
    boards.create(db, 'Casa', now)
    const data = service()
    await data.backupNow()
    now += HOUR_MS
    expect(await data.hourly()).toBeNull()

    // Mudou às 10h30: o backup sai na mesma hora, que já passou de 1 hora do último.
    now += HOUR_MS / 2
    boards.create(db, 'Trabalho', now)
    expect(await data.hourly()).toMatchObject({ kind: 'hourly', name: 'mello-2026-10-21_1030.db' })

    // Mudou de novo: o próximo só 1 hora depois desse.
    boards.create(db, 'Viagem', now)
    now += HOUR_MS / 2
    expect(await data.hourly()).toBeNull()
    now += HOUR_MS / 2
    expect(await data.hourly()).toMatchObject({ name: 'mello-2026-10-21_1130.db' })
    now += HOUR_MS
    expect(await data.hourly()).toBeNull()
  })

  it('a falha de um backup automático vira um aviso; o app continua', async () => {
    boards.create(db, 'Casa', now)
    // Um arquivo no lugar da pasta de backup: não dá para gravar.
    fs.rmSync(paths.backups, { recursive: true })
    fs.writeFileSync(paths.backups, '')
    const data = service()
    expect(await data.atOpen()).toBeNull()
    expect(data.takeNotices()).toEqual([FAILED_NOTICE])
    expect(life.notices).toBe(1)
  })
})

describe('pasta de backup (DAD-04)', () => {
  it('a pasta escolhida vale; indisponível, o backup vai para a padrão e avisa uma vez', async () => {
    const external = path.join(root, 'HD externo')
    fs.mkdirSync(external)
    const data = service()
    await data.setFolder(external)
    expect(settings.get(db)['backup.folder']).toBe(external)
    expect(listBackups(external)).toHaveLength(1)
    expect(data.overview()).toMatchObject({
      folder: path.join('%APPDATA%', 'HD externo'),
      custom: true,
      unavailable: false
    })

    fs.rmSync(external, { recursive: true })
    await data.backupNow()
    await data.backupNow()
    expect(listBackups(paths.backups)).toHaveLength(2)
    expect(data.takeNotices()).toEqual([UNAVAILABLE_NOTICE])
    expect(data.takeNotices()).toEqual([])
    expect(data.overview()).toMatchObject({
      folder: path.join('%APPDATA%', 'Mello', 'backups'),
      custom: true,
      unavailable: true
    })
  })

  it('a pasta de dados do Mello não serve; escolher a padrão volta para a padrão', async () => {
    const data = service()
    await expect(data.setFolder(paths.files)).rejects.toThrow('fora da pasta de dados')
    await expect(data.setFolder(paths.root)).rejects.toThrow('fora da pasta de dados')
    await data.setFolder(path.join(root, 'outra'))
    expect(settings.get(db)['backup.folder']).toBe(path.join(root, 'outra'))
    await data.setFolder(paths.backups)
    expect(settings.get(db)['backup.folder']).toBeNull()
  })

  it('o aviso de "mesmo disco": mesma unidade dos dados, fora de pasta sincronizada', () => {
    const onedrive = 'C:\\Users\\ana\\OneDrive'
    expect(
      onSameDisk(
        'C:\\Users\\ana\\AppData\\Roaming\\Mello\\backups',
        'C:\\Users\\ana\\AppData\\Roaming\\Mello',
        [onedrive]
      )
    ).toBe(true)
    expect(
      onSameDisk('E:\\Backups do Mello', 'C:\\Users\\ana\\AppData\\Roaming\\Mello', [onedrive])
    ).toBe(false)
    expect(
      onSameDisk('C:\\Users\\ana\\OneDrive\\Mello', 'C:\\Users\\ana\\AppData\\Roaming\\Mello', [
        onedrive
      ])
    ).toBe(false)
    expect(
      displayPath(
        'C:\\Users\\ana\\AppData\\Roaming\\Mello\\backups',
        'C:\\Users\\ana\\AppData\\Roaming'
      )
    ).toBe('%APPDATA%\\Mello\\backups')
    expect(displayPath('E:\\Backups do Mello', 'C:\\Users\\ana\\AppData\\Roaming')).toBe(
      'E:\\Backups do Mello'
    )
  })
})

describe('restaurar (DAD-06)', () => {
  it('guarda o estado atual num backup, fecha o banco, troca, traz os arquivos e reinicia', async () => {
    const casa = boards.create(db, 'Casa', now)
    withStoredFile(casa.id)
    const data = service()
    const before = await data.backupNow()

    now = at(21, 11)
    boards.create(db, 'Depois do backup', now)
    fs.rmSync(path.join(paths.files, `${HASH}.png`))
    await data.restore(before.name)

    expect(life).toMatchObject({ shutdowns: 1, restarts: 1 })
    expect(listBackups(paths.backups).map((item) => item.kind)).toEqual(['restore', 'manual'])
    open()
    expect(boards.listOpen(db).map((board) => board.title)).toEqual(['Casa'])
    expect(fs.readFileSync(path.join(paths.files, `${HASH}.png`), 'utf8')).toBe('ccc')
  })

  it('com 10 backups, restaurar o mais antigo não o apaga na rotação', async () => {
    boards.create(db, 'Casa', now)
    const data = service()
    for (let hour = 1; hour <= 10; hour++) {
      now = at(20, hour)
      await data.backupNow()
    }
    now = at(21, 9)
    await data.restore('mello-2026-10-20_0100.db')
    expect(life.restarts).toBe(1)
    expect(listBackups(paths.backups)).toHaveLength(11)
  })

  it('backup que não está na pasta ou que não é do Mello: nada muda', async () => {
    const data = service()
    await expect(data.restore('mello-2026-10-01_0900.db')).rejects.toThrow('não está mais na pasta')
    fs.writeFileSync(path.join(paths.backups, 'mello-2026-10-01_0900.db'), 'lixo')
    await expect(data.restore('mello-2026-10-01_0900.db')).rejects.toThrow('danificado')
    expect(life).toMatchObject({ shutdowns: 0, restarts: 0 })
    expect(listBackups(paths.backups)).toEqual([])
  })
})

describe('exportar (DAD-07)', () => {
  it('a pasta Mello-exportacao-AAAA-MM-DD com o dados.json de todas as tabelas e os arquivos', async () => {
    const casa = boards.create(db, 'Casa', now)
    withStoredFile(casa.id)
    const parent = path.join(root, 'Documentos')
    fs.mkdirSync(parent)
    const first = await exportData({
      sqlite,
      filesDir: paths.files,
      parent,
      now,
      version: '0.10.0'
    })
    expect(path.basename(first.folder)).toBe('Mello-exportacao-2026-10-21')

    const json = JSON.parse(fs.readFileSync(first.json, 'utf8'))
    expect(json).toMatchObject({ app: 'Mello', versao: '0.10.0', exportadoEm: '2026-10-21 09:00' })
    expect(Object.keys(json.tabelas).sort()).toEqual(
      [
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
      ].sort()
    )
    expect(json.tabelas.board).toMatchObject([{ title: 'Casa', bg_value: HASH }])
    expect(json.tabelas.list).toHaveLength(4)
    expect(fs.readFileSync(path.join(first.folder, 'arquivos', `${HASH}.png`), 'utf8')).toBe('ccc')
    // Legível num editor de texto: uma propriedade por linha.
    expect(fs.readFileSync(first.json, 'utf8')).toContain('\n        "title": "Casa",\n')

    const second = await exportData({
      sqlite,
      filesDir: paths.files,
      parent,
      now,
      version: '0.10.0'
    })
    expect(path.basename(second.folder)).toBe('Mello-exportacao-2026-10-21 (2)')
  })
})

describe('apagar tudo (DAD-09)', () => {
  it('apaga o banco e os arquivos; nos backups, só com a opção, e só os nomes do Mello', async () => {
    const casa = boards.create(db, 'Casa', now)
    withStoredFile(casa.id)
    const data = service()
    await data.backupNow()
    fs.writeFileSync(path.join(paths.backups, 'anotações.txt'), 'meu')

    data.deleteAll(false)
    expect(life).toMatchObject({ shutdowns: 1, restarts: 1 })
    expect(fs.existsSync(paths.db)).toBe(false)
    expect(fs.existsSync(paths.files)).toBe(false)
    expect(listBackups(paths.backups)).toHaveLength(1)

    removeEverything({ dbFile: paths.db, filesDir: paths.files, backupFolders: [paths.backups] })
    expect(fs.readdirSync(paths.backups)).toEqual(['anotações.txt'])
  })

  it('com a opção, os backups da pasta escolhida também saem', async () => {
    boards.create(db, 'Casa', now)
    const external = path.join(root, 'HD externo')
    fs.mkdirSync(external)
    const data = service()
    await data.backupNow()
    await data.setFolder(external)
    data.deleteAll(true)
    expect(listBackups(paths.backups)).toEqual([])
    expect(listBackups(external)).toEqual([])
    expect(fs.existsSync(path.join(external, MIRROR_DIR))).toBe(false)
  })
})
