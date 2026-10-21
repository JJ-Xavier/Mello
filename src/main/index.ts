// Processo principal: ciclo de vida do app, banco, protocolo de arquivos, IPC e a janela.
import path from 'node:path'
import { app, BrowserWindow, dialog, Menu, nativeTheme, screen, session, shell } from 'electron'
import log from 'electron-log/main'
import { openDatabase, type OpenedDatabase } from './db/open'
import { registerIpc } from './ipc'
import { dataPaths, ensureDataFolders } from './paths'
import { registerFileProtocol, registerFileSchemeAsPrivileged } from './protocol'

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

  // Nada abre dentro do app: links externos vão para o navegador padrão (só https).
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
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
  registerIpc({ dataDir: paths.root })

  mainWindow = createWindow()
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

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

  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => database?.sqlite.close())
}
