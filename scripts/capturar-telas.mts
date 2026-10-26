// Abre o app compilado (out/) com uma pasta de dados temporária e salva uma captura de cada tela,
// nos temas escuro e claro, em capturas/etapa-N/ (pasta ignorada pelo Git). Serve para comparar
// com o protótipo e também confere a ponta a ponta: banco criado e IPC respondendo.
// Os dados são fictícios (P16) e criados pelo próprio window.mello. Os anexos são arquivos
// fictícios gerados na hora (as fotos são gradientes desenhados no canvas); a janela "Abrir" do
// Windows é trocada por uma que devolve esses arquivos.
//
// Uso: npm run capturas   (compila antes; roda com o Node 24, que entende TypeScript)
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import playwright, { type ElectronApplication, type Page } from 'playwright-core'

const STAGE = 7
const THEMES = ['escuro', 'claro']

const root = path.resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const electronPath = require('electron') as string
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mello-capturas-'))
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mello-capturas-arquivos-'))
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

// Três tentativas de 15 s: um quadro que não chega (veja as opções do launch) não derruba tudo.
async function shot(page: Page, name: string, theme: string) {
  const file = path.join(outDir, `${name}-${theme}.png`)
  for (let attempt = 1; ; attempt++) {
    try {
      await page.screenshot({ path: file, timeout: 15_000 })
      break
    } catch (error) {
      if (attempt === 3) throw error
      console.log(`Captura ${name}-${theme}: sem quadro, tentando de novo.`)
    }
  }
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

// Nome de um dia no calendário, como a tela o lê: "qua., 21 de outubro".
function dayLabel(offset: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long'
  }).format(date)
}

// Chama window.mello.<caminho>(entrada) e devolve o resultado.
function mello<T>(page: Page, method: string, input: unknown): Promise<T> {
  return call<T>(page, `window.mello.${method}(${JSON.stringify(input)})`)
}

// Documento do editor com um título, um parágrafo e uma lista.
function doc(title: string, text: string, items: string[] = []) {
  const paragraph = (value: string) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: value }]
  })
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: title }] },
      paragraph(text),
      ...(items.length
        ? [
            {
              type: 'bulletList',
              content: items.map((i) => ({ type: 'listItem', content: [paragraph(i)] }))
            }
          ]
        : [])
    ]
  }
}

// Nota do card "Pintar o quarto", como a da tela 4: títulos, caixas de marcar e um parágrafo.
function noteDoc() {
  const text = (value: string) => [{ type: 'text', text: value }]
  const task = (value: string, checked: boolean) => ({
    type: 'taskItem',
    attrs: { checked },
    content: [{ type: 'paragraph', content: text(value) }]
  })
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 3 }, content: text('Pendências') },
      {
        type: 'taskList',
        content: [task('Comprar fita crepe larga', true), task('Escolher o rolo de lã', false)]
      },
      { type: 'heading', attrs: { level: 3 }, content: text('Anotações') },
      { type: 'paragraph', content: text('A loja do bairro entrega no sábado.') }
    ]
  }
}

// Foto fictícia: um gradiente desenhado no canvas da própria janela, salvo como PNG.
async function writePhoto(page: Page, name: string, stops: [number, string][]) {
  const base64 = (await page.evaluate(`(async () => {
    const canvas = new OffscreenCanvas(480, 320)
    const context = canvas.getContext('2d')
    const gradient = context.createLinearGradient(0, 0, 0, 320)
    for (const [offset, color] of ${JSON.stringify(stops)}) gradient.addColorStop(offset, color)
    context.fillStyle = gradient
    context.fillRect(0, 0, 480, 320)
    const bytes = new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  })()`)) as string
  const file = path.join(userDir, name)
  fs.writeFileSync(file, Buffer.from(base64, 'base64'))
  return file
}

// Anexa pelos canais de verdade: a janela "Abrir" (trocada) devolve os arquivos.
async function attach(app: ElectronApplication, page: Page, cardId: string, files: string[]) {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: chosen })
  }, files)
  const picked = await mello<{ token: string }[]>(page, 'files.pick', { imagesOnly: false })
  await mello(page, 'attachments.add', { cardId, tokens: picked.map((p) => p.token) })
  const detail = await mello<{ attachments: { name: string; fileId: string }[] }>(
    page,
    'cards.get',
    { cardId }
  )
  return Object.fromEntries(detail.attachments.map((a) => [a.name, a.fileId]))
}

// Um checklist com itens; done marca os primeiros, dates dá a data (dias a partir de hoje).
async function addChecklist(
  page: Page,
  cardId: string,
  title: string,
  items: { text: string; done?: boolean; date?: number }[]
) {
  const checklist = await mello<{ id: string }>(page, 'checklists.create', { cardId, title })
  for (const item of items) {
    const created = await mello<{ id: string }>(page, 'items.create', {
      checklistId: checklist.id,
      text: item.text
    })
    if (item.done) await mello(page, 'items.toggle', { itemId: created.id, isDone: true })
    if (item.date !== undefined) {
      await mello(page, 'items.update', {
        itemId: created.id,
        due: { dueDate: day(item.date), showInCalendar: true }
      })
    }
  }
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
// O "+N mais" de hoje (se a janela não couber tudo) e o "Adicionar" de daqui a 3 dias.
async function calendarPopovers(page: Page, theme: string, screen: string) {
  const more = page.getByRole('group', { name: dayLabel(0) }).getByRole('button', { name: /mais$/ })
  if ((await more.count()) > 0) {
    await more.click()
    await page.waitForTimeout(250)
    await shot(page, `${screen}-calendario-mais`, theme)
    await closePopovers(page)
  } else {
    console.log(`Captura ${screen}-calendario-mais: tudo coube no dia, sem "+N mais".`)
  }
  // Perto do fim do mês, o dia pode cair no mês seguinte, que não tem "Adicionar".
  const later = page.getByRole('group', { name: dayLabel(3) })
  const add = later.getByRole('button', { name: 'Adicionar' })
  if ((await add.count()) === 0) return
  await later.hover()
  await add.click()
  await page.waitForTimeout(250)
  await shot(page, `${screen}-calendario-adicionar`, theme)
  await closePopovers(page)
}

async function seed(app: ElectronApplication, page: Page): Promise<{ casa: Board }> {
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
  // Criado em "A fazer" e movido: a atividade mostra os dois registros, como na tela 4.
  const pintar = await card(list('A fazer'), 'Pintar o quarto')
  await mello(page, 'cards.move', { cardId: pintar, listId: list('Em andamento'), index: 0 })
  const lampadas = await card(list('A fazer'), 'Trocar as lâmpadas')
  await card(ideias.id, 'Horta na varanda')
  const viagem = await card(ideias.id, 'Viagem de férias')
  const revisao = await card(list('Concluído'), 'Revisão semanal')
  // Movido para Concluído: ganha o ✓ sozinho (FIN-02).
  await call(
    page,
    `window.mello.cards.move({ cardId: '${lampadas}', listId: '${list('Concluído')}', index: 0 })`
  )

  const labels = (await mello<{ id: string }[]>(page, 'labels.list', { boardId: casa.id })).map(
    (l) => l.id
  )
  const [roxo, vermelho, laranja, amarelo, cinza, verde] = labels
  await mello(page, 'labels.update', { labelId: amarelo, name: 'Pintura' })
  const setLabels = (cardId: string, labelIds: (string | undefined)[]) =>
    mello(page, 'cards.setLabels', { cardId, labelIds })
  const update = (cardId: string, changes: Record<string, unknown>) =>
    mello(page, 'cards.update', { cardId, ...changes })

  await setLabels(tinta, [roxo, cinza])
  await update(tinta, { priority: 4, description: doc('Tinta', 'Branco gelo, 18 litros') })
  await addChecklist(page, tinta, 'Materiais', [
    { text: 'Tinta', done: true },
    { text: 'Rolo', done: true },
    { text: 'Fita crepe' },
    { text: 'Lona' },
    { text: 'Pincel' }
  ])
  await setLabels(torneira, [vermelho, roxo])
  await update(torneira, {
    priority: 2,
    due: { dueAt: day(-2), reminder: 'none' },
    description: doc('Vazamento', 'Pinga embaixo da pia')
  })
  await addChecklist(page, torneira, 'Conserto', [
    { text: 'Fechar o registro', done: true },
    { text: 'Trocar o vedante', done: true },
    { text: 'Testar' },
    { text: 'Limpar' },
    { text: 'Abrir o registro' }
  ])
  await setLabels(condominio, [laranja])
  await update(condominio, { priority: 3, due: { dueAt: day(5), reminder: 'day_before' } })
  await setLabels(pintar, [amarelo])
  await update(pintar, {
    priority: 1,
    due: { dueAt: `${day(1)}T17:00`, reminder: 'day_before' },
    description: doc('Quarto do fundo', 'Duas demãos, cor branco gelo.', [
      'Afastar os móveis do centro',
      'Proteger as tomadas'
    ])
  })
  await addChecklist(page, pintar, 'Preparação', [
    { text: 'Afastar os móveis', done: true, date: -5 },
    { text: 'Cobrir o chão', done: true },
    { text: 'Lixar as paredes', date: -1 }
  ])
  await addChecklist(page, pintar, 'Pintura', [
    { text: 'Primeira demão', date: 2 },
    { text: 'Segunda demão' },
    { text: 'Retoques' },
    { text: 'Limpar os pincéis' }
  ])
  await update(pintar, { note: noteDoc() })
  fs.writeFileSync(path.join(userDir, 'orcamento-da-tinta.pdf'), '%PDF-1.4 orçamento fictício')
  await attach(app, page, pintar, [path.join(userDir, 'orcamento-da-tinta.pdf')])
  await setLabels(lampadas, [verde])
  await update(lampadas, { due: { dueAt: day(-3), reminder: 'none' } })

  // Tela 14: card com capa de imagem e anexos; tela 16: capa de cor na face.
  const foto = await writePhoto(page, 'foto-da-pousada.png', [
    [0, '#7cc4e8'],
    [0.52, '#bfe3f0'],
    [0.53, '#e9d8a6'],
    [1, '#d9c08a']
  ])
  const mapa = await writePhoto(page, 'mapa-do-roteiro.png', [
    [0, '#d7e6c3'],
    [0.5, '#a9c79a'],
    [1, '#7fa7c9']
  ])
  const passagens = path.join(userDir, 'passagens.pdf')
  fs.writeFileSync(passagens, '%PDF-1.4 passagens fictícias')
  const files = await attach(app, page, viagem, [mapa, passagens, foto])
  await setLabels(viagem, [verde])
  await update(viagem, {
    priority: 3,
    due: { dueAt: day(50), reminder: 'none' },
    description: doc('Pousada', 'Perto da praia, cinco noites.')
  })
  await mello(page, 'cards.setCover', {
    cardId: viagem,
    cover: { kind: 'image', fileId: files['foto-da-pousada.png'] }
  })
  await setLabels(revisao, [roxo])
  await mello(page, 'cards.setCover', {
    cardId: revisao,
    cover: { kind: 'color', color: '#206a83' }
  })

  // Telas 5 e 13: um dia cheio hoje (para o "+N mais"), tarefas do condomínio e cards do quadro
  // "Estudos" no calendário de todos os quadros.
  const dentista = await card(ideias.id, 'Dentista')
  await setLabels(dentista, [verde])
  await update(dentista, { due: { dueAt: `${day(0)}T15:00`, reminder: 'none' } })
  const encanador = await card(ideias.id, 'Ligar para o encanador')
  await setLabels(encanador, [vermelho])
  await update(encanador, { priority: 2, due: { dueAt: day(0), reminder: 'none' } })
  await addChecklist(page, condominio, 'Antes de pagar', [
    { text: 'Separar o boleto', date: 0 },
    { text: 'Conferir a taxa extra', date: 0, done: true }
  ])
  const estudosLists = (
    await mello<{ lists: { id: string }[] }>(page, 'boards.get', { boardId: estudos.id })
  ).lists
  const estudosLabels = (
    await mello<{ id: string }[]>(page, 'labels.list', { boardId: estudos.id })
  ).map((l) => l.id)
  const prova = await card(estudosLists[0]!.id, 'Prova de inglês')
  await mello(page, 'cards.setLabels', { cardId: prova, labelIds: [estudosLabels[1]] })
  await update(prova, { priority: 1, due: { dueAt: day(2), reminder: 'none' } })
  const trabalho = await card(estudosLists[0]!.id, 'Entregar trabalho')
  await mello(page, 'cards.setLabels', { cardId: trabalho, labelIds: [estudosLabels[3]] })
  await update(trabalho, { priority: 3, due: { dueAt: day(4), reminder: 'none' } })
  const curso = await card(estudosLists[1]!.id, 'Curso de inglês')
  await addChecklist(page, curso, 'Capítulos', [
    { text: 'Ler o capítulo 3', date: -3 },
    { text: 'Fazer os exercícios', date: 0 }
  ])
  return { casa }
}

// Com a janela coberta por outra, ou o monitor desligado pelo Windows durante o roteiro, o
// Chromium para de desenhar e a captura não termina. Estas opções (só do script) mantêm a janela
// desenhando: sem o corte de janela escondida e sem esperar o sinal de atualização do monitor.
const app = await playwright._electron.launch({
  executablePath: electronPath,
  args: [
    root,
    '--disable-features=CalculateNativeWinOcclusion',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit'
  ],
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

  const { casa } = await seed(app, page)
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

    // Tela 4 (coluna da esquerda) e os popovers do modal (telas 9, 14 e 16).
    await page.getByRole('link', { name: /Pintar o quarto/ }).click()
    const modal = page.getByRole('dialog', { name: 'Pintar o quarto' })
    await modal.waitFor()
    await page.waitForTimeout(300)
    await shot(page, '04-modal', theme)
    const popover = async (button: RegExp | string, name: string) => {
      await modal.getByRole('button', { name: button }).first().click()
      await page.waitForTimeout(250)
      await shot(page, name, theme)
      await closePopovers(page)
    }
    await popover('Adicionar', '09-menu-adicionar')
    await popover('Pintura', '09-etiquetas')
    await popover(/Muito alta/, '09-prioridade')
    await popover(/, 17:00/, '09-seletor-de-data')
    await popover(/Data da tarefa: .* em atraso/, '09-data-da-tarefa')
    await popover('Mais ações', '14-menu-do-card')
    await modal.getByRole('button', { name: 'Mais ações' }).click()
    await page
      .getByRole('dialog', { name: 'Ações do card' })
      .getByRole('button', { name: 'Mover', exact: true })
      .click()
    await page.waitForTimeout(250)
    await shot(page, '16-mover-card', theme)
    await closePopovers(page)
    await modal.getByRole('button', { name: 'Mais ações' }).click()
    await page
      .getByRole('dialog', { name: 'Ações do card' })
      .getByRole('button', { name: 'Copiar', exact: true })
      .click()
    await page.waitForTimeout(250)
    await shot(page, '16-copiar-card', theme)
    await closePopovers(page)
    await modal.getByRole('button', { name: 'Mais ações' }).click()
    await page
      .getByRole('dialog', { name: 'Ações do card' })
      .getByRole('button', { name: 'Excluir', exact: true })
      .click()
    await page.waitForTimeout(250)
    await shot(page, '16-confirmar-exclusao-card', theme)
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click()
    await page.waitForTimeout(200)
    await modal.getByRole('button', { name: 'Editar' }).click()
    await page.waitForTimeout(250)
    await shot(page, '04-descricao-editando', theme)
    await modal.getByRole('button', { name: 'Cancelar' }).click()
    // Tela 4, coluna da direita: a atividade aberta.
    await modal.getByRole('button', { name: /Atividade/ }).click()
    await page.waitForTimeout(200)
    await shot(page, '04-atividade', theme)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)

    // Tela 14: card com capa e anexos, o popover da capa e arquivos arrastados por cima.
    await page.getByRole('link', { name: /Viagem de férias/ }).click()
    const travel = page.getByRole('dialog', { name: 'Viagem de férias' })
    await travel.getByRole('img', { name: 'Miniatura de foto-da-pousada.png' }).waitFor()
    await page.waitForTimeout(300)
    await shot(page, '14-capa-e-anexos', theme)
    await travel.getByRole('button', { name: 'Capa do card' }).click()
    await page.waitForTimeout(250)
    await shot(page, '14-capa', theme)
    await closePopovers(page)
    // Um arquivo arrastado por cima do modal (sem soltar).
    await page.evaluate(`{
      const transfer = new DataTransfer()
      transfer.items.add(new File(['x'], 'roteiro.txt'))
      document.querySelector('dialog h1').dispatchEvent(
        new DragEvent('dragover', { dataTransfer: transfer, bubbles: true })
      )
    }`)
    await page.waitForTimeout(150)
    await shot(page, '14-soltar-para-anexar', theme)
    await page.evaluate(
      `document.querySelector('dialog h1').dispatchEvent(new DragEvent('dragleave', { bubbles: true }))`
    )
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)

    // Card arquivado: o modal continua aberto, com o aviso.
    await page.getByRole('link', { name: /Organizar o armário/ }).click()
    const archived = page.getByRole('dialog', { name: 'Organizar o armário' })
    await archived.getByRole('button', { name: 'Mais ações' }).click()
    await page
      .getByRole('dialog', { name: 'Ações do card' })
      .getByRole('button', { name: 'Arquivar', exact: true })
      .click()
    await archived.getByText('Este card está arquivado.').waitFor()
    await page.waitForTimeout(200)
    await shot(page, '16-card-arquivado', theme)
    await archived.getByRole('button', { name: 'Restaurar' }).click()
    await page.waitForTimeout(250)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)

    // Filtro do quadro (tela 9) com uma prioridade marcada.
    await page.getByRole('button', { name: 'Filtrar cards' }).click()
    await page.getByRole('checkbox', { name: /Muito alta/ }).check()
    await page.getByRole('checkbox', { name: /Alta$/ }).check()
    await page.waitForTimeout(300)
    await shot(page, '09-filtro', theme)
    await page.getByRole('button', { name: 'Limpar filtro' }).click()
    await closePopovers(page)

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

    // Tela 5: calendário do quadro, com o "Adicionar", o "+N mais", o seletor de mês e o modal.
    // O mouse fica na borda da janela: parado sobre um dia, ele mostraria o "Adicionar".
    await go(page, `#/boards/${casa.id}/calendar`)
    await page.getByRole('link', { name: /Consertar a torneira/ }).waitFor()
    await page.mouse.move(2, 600)
    await page.waitForTimeout(300)
    await shot(page, '05-calendario-do-quadro', theme)
    await calendarPopovers(page, theme, '05')
    await page.getByRole('button', { name: /Escolher mês/ }).click()
    await page.waitForTimeout(250)
    await shot(page, '05-calendario-escolher-mes', theme)
    await closePopovers(page)
    await page.getByRole('link', { name: /Consertar a torneira/ }).click()
    await page.getByRole('dialog', { name: 'Consertar a torneira da cozinha' }).waitFor()
    await page.waitForTimeout(300)
    await shot(page, '05-calendario-modal', theme)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)

    // Tela 13: calendário de todos os quadros e o seletor de quadro.
    await go(page, '#/calendar')
    await page.getByRole('link', { name: /Prova de inglês/ }).waitFor()
    await page.mouse.move(2, 600)
    await page.waitForTimeout(300)
    await shot(page, '13-calendario-todos', theme)
    await page.getByRole('button', { name: /Quadros no calendário/ }).click()
    await page.waitForTimeout(250)
    await shot(page, '13-calendario-escolher-quadro', theme)
    await closePopovers(page)
    await calendarPopovers(page, theme, '13')

    await go(page, '#/settings')
    await shot(page, '07-configuracoes', theme)
  }
} finally {
  await app.close()
  fs.rmSync(dataDir, { recursive: true, force: true })
  fs.rmSync(userDir, { recursive: true, force: true })
}
