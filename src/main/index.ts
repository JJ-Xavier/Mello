// Processo principal: ciclo de vida do app, banco, protocolo de arquivos, IPC, agendador, bandeja,
// backups, tema e a janela.
import fs from 'node:fs'
import os from 'node:os'
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
import type { Theme } from '../shared/ipc/settings'
import { safeHref } from '../shared/rules/richText'
import { createClock } from './clock'
import { openDatabase, type OpenedDatabase } from './db/open'
import { registerIpc } from './ipc'
import { createData } from './modules/data'
import { cleanUnusedFiles } from './modules/files'
import * as settings from './modules/settings'
import { dataPaths, ensureDataFolders } from './paths'
import { registerFileProtocol, registerFileSchemeAsPrivileged } from './protocol'
import { createScheduler, type Scheduler } from './scheduler'
import { electronSystem } from './system'
import { createTray, electronNotifier } from './tray'

const APP_ID = 'com.jjxavier.mello'
const isDev = !app.isPackaged
// "Iniciar com o Windows" (P4) abre o Mello com este argumento: direto na bandeja, sem a janela.
const TRAY_ARG = '--na-bandeja'
const startInTray = process.argv.includes(TRAY_ARG)

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

// O --bg do tema da janela, para não piscar outra cor antes de a tela desenhar.
const windowBackground = () => (nativeTheme.shouldUseDarkColors ? '#1d2125' : '#f7f8f9')

// TEM-01 e TEM-03: o tema do Chromium e da barra de título. Com "Igual ao sistema", o Electron
// acompanha o Windows sozinho, e a tela (prefers-color-scheme) também.
function applyTheme(theme: Theme): void {
  nativeTheme.themeSource = theme
  mainWindow?.setBackgroundColor(windowBackground())
}

// P4: "Iniciar com o Windows" abre o Mello na bandeja. No desenvolvimento só fica gravado, para
// não registrar o Electron de desenvolvimento na inicialização do Windows.
function setAutoStart(enabled: boolean): void {
  if (isDev) {
    log.info(`Iniciar com o Windows: ${enabled ? 'ligado' : 'desligado'} (só no app instalado)`)
    return
  }
  app.setLoginItemSettings({ openAtLogin: enabled, args: [TRAY_ARG] })
}

// Restaurar um backup e apagar tudo terminam abrindo o app de novo, com o banco que estiver lá.
function restart(): void {
  quitting = true
  tray?.destroy()
  app.relaunch({ args: process.argv.slice(1).filter((arg) => arg !== TRAY_ARG) })
  app.exit(0)
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
    backgroundColor: windowBackground(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  // Aberto pelo Windows ao ligar o computador, fica só na bandeja.
  window.once('ready-to-show', () => {
    if (!startInTray) window.show()
  })

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

  const paths = dataPaths(app.getPath('userData'))
  ensureDataFolders(paths)
  log.transports.file.resolvePathFn = () => path.join(paths.logs, 'main.log')
  log.info(`Mello ${app.getVersion()} iniciando. Dados em ${paths.root}`)

  database = await openDatabase({
    file: paths.db,
    backupsDir: paths.backups,
    filesDir: paths.files,
    now: Date.now()
  })
  if (database.backupPath) log.info(`Backup antes de migrar: ${database.backupPath}`)
  if (database.applied.length > 0) log.info(`Migrações aplicadas: ${database.applied.join(', ')}`)
  const opened = database
  const saved = settings.get(opened.db)
  // O tema escolhido (TEM-01, escuro por padrão) e o "Iniciar com o Windows", que pode ter mudado
  // com uma restauração ou com "Apagar tudo".
  applyTheme(saved.theme)
  setAutoStart(saved['app.autoStart'])
  nativeTheme.on('updated', () => mainWindow?.setBackgroundColor(windowBackground()))

  // DAD-08: os arquivos que nada mais usa saem antes de a tela poder guardar outros.
  try {
    const { removed } = cleanUnusedFiles(opened.db, paths.files)
    if (removed > 0) log.info(`Arquivos sem uso apagados: ${removed}`)
  } catch (error) {
    log.error('Falha ao limpar os arquivos sem uso', error)
  }

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

  // Dados e backup (DAD). Restaurar e apagar tudo param o agendador, fecham o banco e reiniciam.
  const clock = createClock()
  const home = os.homedir()
  const data = createData({
    sqlite: opened.sqlite,
    db: opened.db,
    paths,
    now: () => clock.now(),
    version: app.getVersion(),
    exportsDefault: app.getPath('documents'),
    appData: app.getPath('appData'),
    syncFolders: [
      ...['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial'].flatMap((name) => {
        const folder = process.env[name]
        return folder ? [folder] : []
      }),
      path.join(home, 'Google Drive'),
      path.join(home, 'Meu Drive'),
      path.join(home, 'My Drive'),
      path.join(home, 'Dropbox')
    ],
    shutdown: () => {
      scheduler?.stop()
      opened.sqlite.close()
    },
    restart,
    onNotice: () => send(EVENTS.backupNotice),
    onError: (error) => log.error('[backup]', error)
  })

  // Agendador (REP-11, LEM): a primeira rodada é agora, antes de a tela abrir, e guarda os
  // lembretes perdidos com o app fechado para o aviso agrupado (LEM-06). As seguintes conferem o
  // backup de hora em hora (DAD-01).
  scheduler = createScheduler({
    db: opened.db,
    clock,
    notifier: electronNotifier((cardId, boardId) => {
      showWindow()
      send(EVENTS.openCard, { cardId, boardId })
    }),
    onChange: () => send(EVENTS.dataChanged),
    backup: () => data.hourly(),
    onError: (error) => log.error('[agendador]', error)
  })
  scheduler.start()

  registerIpc({
    dataDir: paths.root,
    db: opened.db,
    clock,
    files: { dir: paths.files, system: electronSystem(openedCopies) },
    scheduler,
    hideToTray: () => {
      trayNoticeOpen = false
      mainWindow?.hide()
    },
    data,
    desktop: { applyTheme, setAutoStart }
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

  // DAD-01: o backup da abertura, se o último tiver mais de 1 hora. Roda junto com a tela; um
  // aviso (pasta indisponível, falha) espera a tela pedir (data:notices).
  void data.atOpen().then((item) => {
    if (item) log.info(`Backup ao abrir: ${item.name}`)
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
