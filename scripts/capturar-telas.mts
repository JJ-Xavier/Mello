// Abre o app compilado (out/) com uma pasta de dados temporária e salva uma captura de cada tela,
// nos temas escuro e claro, em capturas/etapa-N/ (pasta ignorada pelo Git). Serve para comparar
// com o protótipo e também confere a ponta a ponta: banco criado e IPC respondendo.
//
// Uso: npm run capturas   (compila antes; roda com o Node 24, que entende TypeScript)
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import playwright from 'playwright-core'

const STAGE = 1
const SCREENS = [
  { name: 'inicio', hash: '#/' },
  { name: 'calendario-todos', hash: '#/calendar' },
  { name: 'quadro', hash: '#/boards/exemplo' },
  { name: 'calendario-do-quadro', hash: '#/boards/exemplo/calendar' },
  { name: 'configuracoes', hash: '#/settings' }
]
const THEMES = ['escuro', 'claro']

const root = path.resolve(import.meta.dirname, '..')
const electronPath = createRequire(import.meta.url)('electron') as string
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mello-capturas-'))
const outDir = path.join(root, 'capturas', `etapa-${STAGE}`)
fs.mkdirSync(outDir, { recursive: true })

// O terminal do VS Code pode herdar ELECTRON_RUN_AS_NODE, que faz o Electron rodar como Node.
const env: Record<string, string> = {}
for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value
}
env['MELLO_DATA_DIR'] = dataDir

const app = await playwright._electron.launch({
  executablePath: electronPath,
  args: [root],
  cwd: root,
  env
})

try {
  const page = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900)
  })
  await page.waitForSelector('header')
  await page.evaluate('document.fonts.ready.then(() => true)')

  const info = (await page.evaluate('window.mello.app.info()')) as { ok: boolean }
  if (!info.ok) throw new Error(`app:info respondeu com erro: ${JSON.stringify(info)}`)
  if (!fs.existsSync(path.join(dataDir, 'mello.db'))) throw new Error('O banco não foi criado.')
  console.log(`Banco criado e IPC respondendo (${JSON.stringify(info)}).`)

  for (const theme of THEMES) {
    await page.evaluate(`document.documentElement.className = 'tema-${theme}'`)
    for (const screen of SCREENS) {
      await page.evaluate(`window.location.hash = '${screen.hash}'`)
      await page.waitForTimeout(300)
      const file = path.join(outDir, `${screen.name}-${theme}.png`)
      await page.screenshot({ path: file })
      console.log(`Captura: ${path.relative(root, file)}`)
    }
  }
} finally {
  await app.close()
  fs.rmSync(dataDir, { recursive: true, force: true })
}
