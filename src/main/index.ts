// Processo principal: ciclo de vida do app, banco, protocolo de arquivos, IPC, agendador, bandeja
// e a janela.
import fs from 'node:fs'
import path from 'node:path'
import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeTheme,
  screen,
  session,
  shell,
  type Tray
} from 'electron'
import log from 'electron-log/main'
import { EVENTS, type EventPayloads, type MelloEvent } from '../shared/ipc/api'
import { safeHref } from '../shared/rules/richText'
import { createClock } from './clock'
import { openDatabase, type OpenedDatabase } from './db/open'
import { registerIpc } from './ipc'
import * as settings from './modules/settings'
import { dataPaths, ensureDataFolders } from './paths'
import { registerFileProtocol, registerFileSchemeAsPrivileged } from './protocol'
import { createScheduler, type Scheduler } from './scheduler'
import { electronSystem } from './system'
import { createTray, electronNotifier } from './tray'

const APP_ID = 'com.jjxavier.mello'
const isDev = !app.isPackaged

// Pasta de dados: separada no desenvolvimento. MELLO_DATA_DIR (só fora do app instalado) aponta
// para uma pasta temporária, usada pelo script de capturas.
if (isDev) {
  const override = process.env['MELLO_DATA_DIR']
  app.setPath('userData', override || path.join(app.getPath('appData'), 'Mello-dev'))
}

registerFileSchemeAsPrivileged()

let mainWindow: BrowserWindow | null = null
let database: OpenedDatabase | null = null
let scheduler: Scheduler | null = null
let tray: Tray | null = null
// "Sair" na bandeja (ou o Windows encerrando): a janela fecha de verdade.
let quitting = false
// O aviso "O Mello continua na bandeja" está na tela, esperando o "Entendi".
let trayNoticeOpen = false

function send<E extends MelloEvent>(event: E, payload?: EventPayloads[E]): void {
  mainWindow?.webContents.send(event, payload)
}

function showWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

// LEM-07 e P4: com "Manter o Mello na bandeja" (o padrão), fechar a janela só a esconde, e o
// agendador continua. Na primeira vez, a tela mostra o aviso e esconde no "Entendi"; fechar de
// novo com o aviso aberto esconde direto. Com a opção desligada, fechar encerra o app.
function keepInTray(window: BrowserWindow, event: Electron.Event): void {
  if (quitting || !database) return
  const current = settings.get(database.db)
  if (!current['tray.keep']) return
  event.preventDefault()
  if (current['tray.noticeShown'] || trayNoticeOpen) {
    settings.set(database.db, 'tray.noticeShown', true)
    trayNoticeOpen = false
    window.hide()
    return
  }
  trayNoticeOpen = true
  send(EVENTS.trayNotice)
}

function createWindow(): BrowserWindow {
  const { workAreaSize } = screen.getPrimaryDisplay()
  const window = new BrowserWindow({
    width: Math.min(1440, workAreaSize.width),
    height: Math.min(900, workAreaSize.height),
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'Mello',
    backgroundColor: '#1d2125',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  window.once('ready-to-show', () => window.show())

  // Nada abre dentro do app: links externos vão para o programa padrão do Windows (navegador ou
  // e-mail), só http, https e mailto, os mesmos que a nota e a descrição aceitam (NOT-05).
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (safeHref(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault()
  })

  if (isDev) {
    // Sem menu, F12 abre as ferramentas de desenvolvedor.
    window.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') window.webContents.toggleDevTools()
    })
  }

  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (isDev && devServer) {
    void window.loadURL(devServer)
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return window
}

async function start(): Promise<void> {
  app.setAppUserModelId(APP_ID)
  Menu.setApplicationMenu(null)
  // Tema escuro por padrão (TEM-01). A escolha do usuário entra na etapa 10.
  nativeTheme.themeSource = 'dark'

  const paths = dataPaths(app.getPath('userData'))
  ensureDataFolders(paths)
  log.transports.file.resolvePathFn = () => path.join(paths.logs, 'main.log')
  log.info(`Mello ${app.getVersion()} iniciando. Dados em ${paths.root}`)

  database = await openDatabase({ file: paths.db, backupsDir: paths.backups, now: Date.now() })
  if (database.backupPath) log.info(`Backup antes de migrar: ${database.backupPath}`)
  if (database.applied.length > 0) log.info(`Migrações aplicadas: ${database.applied.join(', ')}`)

  // A tela não pede nenhuma permissão do navegador (câmera, notificações web etc.).
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
  registerFileProtocol(paths.files)

  // Cópias dos anexos abertos por "Abrir" (ANX-03). As da sessão anterior saem ao abrir o app; uma
  // que ainda esteja aberta num programa fica para a próxima vez.
  const openedCopies = path.join(app.getPath('temp'), isDev ? 'Mello-dev' : 'Mello')
  await fs.promises
    .rm(openedCopies, { recursive: true, force: true, maxRetries: 0 })
    .catch((error: unknown) => log.warn('Cópias de anexos não apagadas', error))

  // Agendador (REP-11, LEM): a primeira rodada é agora, antes de a tela abrir, e guarda os
  // lembretes perdidos com o app fechado para o aviso agrupado (LEM-06).
  const clock = createClock()
  scheduler = createScheduler({
    db: database.db,
    clock,
    notifier: electronNotifier((cardId, boardId) => {
      showWindow()
      send(EVENTS.openCard, { cardId, boardId })
    }),
    onChange: () => send(EVENTS.dataChanged),
    onError: (error) => log.error('[agendador]', error)
  })
  scheduler.start()

  registerIpc({
    dataDir: paths.root,
    db: database.db,
    clock,
    files: { dir: paths.files, system: electronSystem(openedCopies) },
    scheduler,
    hideToTray: () => {
      trayNoticeOpen = false
      mainWindow?.hide()
    }
  })

  tray = createTray({
    open: showWindow,
    quit: () => {
      quitting = true
      app.quit()
    }
  })

  const window = createWindow()
  mainWindow = window
  // O Windows desligando, reiniciando ou saindo da conta encerra de verdade: esconder na bandeja
  // seguraria o desligamento.
  window.on('query-session-end', () => {
    quitting = true
  })
  window.on('session-end', () => {
    quitting = true
  })
  window.on('close', (event) => keepInTray(window, event))
  window.on('closed', () => {
    mainWindow = null
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // Abrir o Mello de novo traz a janela, mesmo escondida na bandeja.
  app.on('second-instance', showWindow)

  app
    .whenReady()
    .then(start)
    .catch((error: unknown) => {
      log.error('Falha ao iniciar', error)
      dialog.showErrorBox(
        'Não foi possível abrir o Mello',
        error instanceof Error ? error.message : String(error)
      )
      app.quit()
    })

  // Com a bandeja, a janela só esconde; ela fecha de verdade com a opção desligada ou no "Sair".
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => {
    quitting = true
  })
  app.on('will-quit', () => {
    scheduler?.stop()
    tray?.destroy()
    database?.sqlite.close()
  })
}
