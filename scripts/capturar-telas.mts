// Abre o app compilado (out/) com uma pasta de dados temporária e salva uma captura de cada tela,
// nos temas escuro e claro, em capturas/etapa-N/ (pasta ignorada pelo Git). Serve para comparar
// com o protótipo e também confere a ponta a ponta: banco criado e IPC respondendo.
// Os dados são fictícios (P16) e criados pelo próprio window.mello.
//
// Uso: npm run capturas   (compila antes; roda com o Node 24, que entende TypeScript)
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import playwright, { type Page } from 'playwright-core'

const STAGE = 2
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

async function call<T>(page: Page, expression: string): Promise<T> {
  const result = (await page.evaluate(expression)) as { ok: boolean; data: T; error?: unknown }
  if (!result.ok) throw new Error(`${expression} → ${JSON.stringify(result.error)}`)
  return result.data
}

async function go(page: Page, hash: string) {
  await page.evaluate(`window.location.hash = '${hash}'`)
  await page.waitForTimeout(400)
}

async function shot(page: Page, name: string, theme: string) {
  const file = path.join(outDir, `${name}-${theme}.png`)
  await page.screenshot({ path: file })
  console.log(`Captura: ${path.relative(root, file)}`)
}

async function closePopovers(page: Page) {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
}

// Dados fictícios: 3 quadros abertos (um favorito), 1 fechado, uma lista arquivada e uma criada.
interface Board {
  id: string
  title: string
}
async function seed(page: Page): Promise<{ casa: Board }> {
  const create = (title: string) =>
    call<Board>(page, `window.mello.boards.create({ title: '${title}' })`)
  const casa = await create('Casa')
  const estudos = await create('Estudos')
  await create('Viagem de férias')
  const mudanca = await create('Mudança')
  await call(page, `window.mello.boards.update({ boardId: '${estudos.id}', isFavorite: true })`)
  await call(page, `window.mello.boards.close({ boardId: '${mudanca.id}' })`)
  const lists = await call<{ lists: { id: string; title: string }[] }>(
    page,
    `window.mello.boards.get({ boardId: '${casa.id}' })`
  )
  await call(page, `window.mello.lists.create({ boardId: '${casa.id}', title: 'Ideias' })`)
  const old = await call<{ id: string }>(
    page,
    `window.mello.lists.create({ boardId: '${casa.id}', title: 'Reforma antiga' })`
  )
  await call(page, `window.mello.lists.archive({ listId: '${old.id}' })`)
  void lists
  return { casa }
}

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

  const info = await call<unknown>(page, 'window.mello.app.info()')
  if (!fs.existsSync(path.join(dataDir, 'mello.db'))) throw new Error('O banco não foi criado.')
  console.log(`Banco criado e IPC respondendo (${JSON.stringify(info)}).`)

  const setTheme = (theme: string) =>
    page.evaluate(`document.documentElement.className = 'tema-${theme}'`)

  // Tela 10: Início vazio (antes de criar qualquer coisa)
  await go(page, '#/')
  await page.getByText('Nenhum quadro ainda').waitFor()
  for (const theme of THEMES) {
    await setTheme(theme)
    await shot(page, '10-inicio-vazio', theme)
  }
  await setTheme('escuro')
  await page.getByRole('button', { name: 'Criar seu primeiro quadro' }).click()
  await page.waitForTimeout(250)
  await shot(page, '10-inicio-vazio-criar-quadro', 'escuro')
  await closePopovers(page)

  const { casa } = await seed(page)
  await page.evaluate('location.reload()')
  await page.waitForSelector('header')

  for (const theme of THEMES) {
    await setTheme(theme)

    await go(page, '#/')
    await page.getByRole('button', { name: 'Criar novo quadro' }).waitFor()
    await shot(page, '01-inicio', theme)

    await page.getByRole('button', { name: 'Ver todos os quadros fechados' }).click()
    await page.waitForTimeout(250)
    await shot(page, '16-quadros-fechados', theme)
    await closePopovers(page)

    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await page.waitForTimeout(250)
    await shot(page, '09-menu-criar', theme)
    await page.getByRole('button', { name: /Criar quadro/ }).click()
    await page.waitForTimeout(250)
    await shot(page, '09-menu-criar-quadro', theme)
    await closePopovers(page)

    await go(page, `#/boards/${casa.id}`)
    await page.getByRole('heading', { name: 'Casa' }).waitFor()
    await shot(page, '02-quadro', theme)

    await page.getByRole('button', { name: 'Adicionar outra lista' }).click()
    await page.waitForTimeout(150)
    await shot(page, '09-nova-lista', theme)
    await page.keyboard.press('Escape')

    await page
      .getByRole('region', { name: 'Concluído' })
      .getByRole('button', { name: 'Ações da lista' })
      .click()
    await page.waitForTimeout(250)
    await shot(page, '16-menu-da-lista', theme)
    await page.getByRole('button', { name: 'Mover lista' }).click()
    await page.waitForTimeout(250)
    await shot(page, '16-mover-lista', theme)
    await closePopovers(page)

    await page.getByRole('button', { name: 'Mais opções do quadro' }).click()
    await page.waitForTimeout(250)
    await shot(page, '16-menu-do-quadro', theme)
    await page.getByRole('button', { name: 'Itens arquivados' }).click()
    await page.getByRole('tab', { name: /Listas/ }).click()
    await page.waitForTimeout(250)
    await shot(page, '16-itens-arquivados', theme)
    await closePopovers(page)

    await page.getByRole('button', { name: 'Mudar de quadros' }).click()
    await page.waitForTimeout(250)
    await shot(page, '09-mudar-de-quadros', theme)
    await closePopovers(page)

    await go(page, `#/boards/${casa.id}/calendar`)
    await shot(page, '05-calendario-do-quadro', theme)
    await go(page, '#/settings')
    await shot(page, '07-configuracoes', theme)
  }
} finally {
  await app.close()
  fs.rmSync(dataDir, { recursive: true, force: true })
}
