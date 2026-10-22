// Abre o app compilado (out/) com uma pasta de dados temporária e salva uma captura de cada tela,
// nos temas escuro e claro, em capturas/etapa-N/ (pasta ignorada pelo Git). Serve para comparar
// com o protótipo e também confere a ponta a ponta: banco criado e IPC respondendo.
// Os dados são fictícios (P16) e criados pelo próprio window.mello. Os campos da face do card que
// ainda não têm tela para editar (etiquetas, datas, checklist, descrição, nota e anexos chegam nas
// etapas 4 e 5) são gravados direto no banco temporário.
//
// Uso: npm run capturas   (compila antes; roda com o Node 24, que entende TypeScript)
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import playwright, { type Page } from 'playwright-core'

const STAGE = 3
const THEMES = ['escuro', 'claro']

const root = path.resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const electronPath = require('electron') as string
const Database = require('better-sqlite3') as typeof import('better-sqlite3')
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

// Dados fictícios: 3 quadros abertos (um favorito), 1 fechado, uma lista arquivada, uma criada e
// cards no quadro "Casa".
interface Board {
  id: string
  title: string
}

// Data local AAAA-MM-DD a N dias de hoje.
function day(offset: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Etiquetas, data, descrição, nota, checklist e anexos de um card, direto no banco.
interface Face {
  labels?: (string | undefined)[]
  due?: string
  text?: string
  note?: string
  checklist?: [done: number, total: number]
  attachments?: number
}

function writeFaces(faces: [cardId: string, face: Face][]) {
  const sqlite = new Database(path.join(dataDir, 'mello.db'))
  const run = (sql: string, ...params: unknown[]) => sqlite.prepare(sql).run(...params)
  const fileId = '0'.repeat(64)
  run(
    'INSERT INTO file (id, ext, mime, size, created_at) VALUES (?, ?, ?, ?, 0)',
    fileId,
    'jpg',
    'image/jpeg',
    1
  )
  for (const [cardId, face] of faces) {
    for (const labelId of face.labels ?? []) {
      run('INSERT INTO card_label (card_id, label_id) VALUES (?, ?)', cardId, labelId)
    }
    run(
      'UPDATE card SET due_at = ?, description_text = ?, note_text = ? WHERE id = ?',
      face.due ?? null,
      face.text ?? '',
      face.note ?? '',
      cardId
    )
    if (face.checklist) {
      const [done, total] = face.checklist
      const checklistId = randomUUID()
      run(
        'INSERT INTO checklist (id, card_id, title, position) VALUES (?, ?, ?, ?)',
        checklistId,
        cardId,
        'Checklist',
        'a0'
      )
      for (let i = 0; i < total; i++) {
        run(
          'INSERT INTO checklist_item (id, checklist_id, text, is_done, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0)',
          randomUUID(),
          checklistId,
          `Item ${i + 1}`,
          i < done ? 1 : 0,
          `a${i}`
        )
      }
    }
    for (let i = 0; i < (face.attachments ?? 0); i++) {
      run(
        'INSERT INTO attachment (id, card_id, file_id, name, created_at) VALUES (?, ?, ?, ?, 0)',
        randomUUID(),
        cardId,
        fileId,
        `foto-${i + 1}.jpg`
      )
    }
  }
  sqlite.close()
}

function boardLabels(boardId: string): string[] {
  const sqlite = new Database(path.join(dataDir, 'mello.db'), { readonly: true })
  const rows = sqlite
    .prepare('SELECT id FROM label WHERE board_id = ? ORDER BY position')
    .all(boardId) as { id: string }[]
  sqlite.close()
  return rows.map((r) => r.id)
}

// Arrasta um card com o mouse até `dy` px abaixo do topo da lista `to` e tira a captura com o
// card no ar. Esc cancela antes de soltar, e os dados continuam iguais nas capturas seguintes.
async function dragShot(
  page: Page,
  card: RegExp,
  to: { list: string; dy: number },
  name: string,
  theme: string
) {
  const from = await page.getByRole('link', { name: card }).boundingBox()
  const target = await page.getByRole('region', { name: to.list }).boundingBox()
  if (!from || !target) throw new Error(`Não achei o card ${card} ou a lista ${to.list}.`)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2, { steps: 4 })
  await page.mouse.move(target.x + target.width / 2, target.y + to.dy, { steps: 12 })
  await page.waitForTimeout(250)
  await shot(page, name, theme)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await page.waitForTimeout(250)
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
  const detail = await call<{ lists: { id: string; title: string }[] }>(
    page,
    `window.mello.boards.get({ boardId: '${casa.id}' })`
  )
  const ideias = await call<{ id: string }>(
    page,
    `window.mello.lists.create({ boardId: '${casa.id}', title: 'Ideias' })`
  )
  const old = await call<{ id: string }>(
    page,
    `window.mello.lists.create({ boardId: '${casa.id}', title: 'Reforma antiga' })`
  )
  await call(page, `window.mello.lists.archive({ listId: '${old.id}' })`)

  const list = (title: string) => detail.lists.find((l) => l.title === title)!.id
  const card = async (listId: string, title: string) =>
    (
      await call<{ id: string }>(
        page,
        `window.mello.cards.create({ listId: '${listId}', title: '${title}' })`
      )
    ).id
  const tinta = await card(list('A fazer'), 'Comprar tinta para o quarto')
  const torneira = await card(list('A fazer'), 'Consertar a torneira da cozinha')
  const condominio = await card(list('A fazer'), 'Pagar o condomínio')
  await card(list('A fazer'), 'Organizar o armário')
  const pintar = await card(list('Em andamento'), 'Pintar o quarto')
  const lampadas = await card(list('A fazer'), 'Trocar as lâmpadas')
  await card(ideias.id, 'Horta na varanda')
  // Movido para Concluído: ganha o ✓ sozinho (FIN-02).
  await call(
    page,
    `window.mello.cards.move({ cardId: '${lampadas}', listId: '${list('Concluído')}', index: 0 })`
  )

  const [roxo, vermelho, laranja, amarelo, cinza, verde] = boardLabels(casa.id)
  writeFaces([
    [tinta, { labels: [roxo, cinza], text: 'Branco gelo', checklist: [2, 5] }],
    [torneira, { labels: [vermelho, roxo], due: day(-2), text: 'Pinga', checklist: [2, 5] }],
    [condominio, { labels: [laranja], due: day(5) }],
    [
      pintar,
      { labels: [amarelo], text: 'Duas demãos', note: 'Fita', checklist: [3, 7], attachments: 2 }
    ],
    [lampadas, { labels: [verde], due: day(-3) }]
  ])
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
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await page.getByRole('button', { name: /Criar card/ }).click()
    await page.waitForTimeout(250)
    await shot(page, '09-menu-criar-card', theme)
    await closePopovers(page)

    await go(page, `#/boards/${casa.id}`)
    await page.getByRole('heading', { name: 'Casa' }).waitFor()
    // Tela 2 no escuro; a tela 8 é o mesmo quadro no tema claro.
    await shot(page, theme === 'claro' ? '08-quadro-claro' : '02-quadro', theme)

    await page
      .getByRole('region', { name: 'A fazer' })
      .getByRole('button', { name: 'Adicionar um cartão' })
      .click()
    await page.waitForTimeout(150)
    await shot(page, '09-novo-card', theme)
    await page.keyboard.press('Escape')

    await dragShot(page, /Comprar tinta/, { list: 'Em andamento', dy: 170 }, '03-arrasto', theme)
    await dragShot(
      page,
      /Organizar o armário/,
      { list: 'Concluído', dy: 60 },
      '16-arrastar-para-finalizado',
      theme
    )

    await page.getByRole('link', { name: /Pintar o quarto/ }).click()
    await page.waitForTimeout(300)
    await shot(page, '04-modal-casca', theme)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

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
