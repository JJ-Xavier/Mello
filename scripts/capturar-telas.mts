// Abre o app compilado (out/) com uma pasta de dados temporária e salva uma captura de cada tela,
// nos temas escuro e claro, em capturas/etapa-N/ (pasta ignorada pelo Git). Serve para comparar
// com o protótipo e também confere a ponta a ponta: banco criado e IPC respondendo.
// Os dados são fictícios (P16) e criados pelo próprio window.mello. Os anexos são arquivos
// fictícios gerados na hora (as fotos são gradientes desenhados no canvas); a janela "Abrir" do
// Windows é trocada por uma que devolve esses arquivos. As notificações do Windows (lembretes)
// ficam anotadas em vez de aparecer na tela, e a lista sai no fim. Os lembretes perdidos e o aviso
// da bandeja precisam de uma segunda abertura do app, com os mesmos dados. O Explorer e o programa
// padrão do Windows também só ficam anotados. O tema muda pela configuração de verdade (etapa 10).
// Restaurar e apagar tudo (etapa 10) saem do app; o script abre de novo com os mesmos dados.
// A busca e os modelos (etapa 11) usam a tela de verdade; o que eles criam sai no fim do bloco.
// O desempenho com 500 cards (etapa 12) é medido num quadro próprio, que sai no fim.
//
// Uso: npm run capturas   (compila antes; roda com o Node 24, que entende TypeScript)
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import playwright, { type ElectronApplication, type Page } from 'playwright-core'

const STAGE = 12
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

// N dias à frente, ou para trás se passar do mês: o calendário abre no mês de hoje (no dia 30,
// hoje + 2 já é o mês seguinte).
function inMonth(offset: number): number {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return date.getMonth() === new Date().getMonth() ? offset : -offset
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

// Foto em retrato, como a "montanhas.jpg" da tela 6 (1080 × 1920): o céu e as montanhas do
// fundo do protótipo, desenhados no canvas da janela e salvos como JPG.
async function writeMountains(page: Page, name: string): Promise<string> {
  const base64 = (await page.evaluate(`(async () => {
    const canvas = new OffscreenCanvas(1080, 1920)
    const context = canvas.getContext('2d')
    const sky = context.createLinearGradient(0, 0, 0, 1920)
    for (const [offset, color] of [[0, '#f7d6b5'], [0.45, '#e7c3a6'], [0.75, '#a9abb8'], [1, '#6d7387']]) {
      sky.addColorStop(offset, color)
    }
    context.fillStyle = sky
    context.fillRect(0, 0, 1080, 1920)
    const ridges = [
      ['M0 560 L120 500 L220 530 L360 440 L470 500 L600 430 L720 480 L860 400 L980 470 L1120 420 L1260 480 L1440 430 V900 H0Z', 'rgba(180,179,189,0.7)'],
      ['M0 640 L140 560 L260 600 L420 520 L540 590 L700 520 L820 470 L990 460 L1080 540 L1220 500 L1340 560 L1440 520 V900 H0Z', '#8a8ea3'],
      ['M0 720 L180 640 L320 690 L480 610 L620 680 L760 600 L900 660 L1060 590 L1200 650 L1320 610 L1440 660 V900 H0Z', '#5b6079'],
      ['M0 800 L160 740 L300 780 L460 720 L640 790 L820 730 L980 790 L1160 740 L1300 780 L1440 750 V900 H0Z', '#33374b']
    ]
    context.setTransform(0.75, 0, 0, 0.75, 0, 1920 - 900 * 0.75)
    for (const [d, color] of ridges) {
      context.fillStyle = color
      context.fill(new Path2D(d))
    }
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 })).arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  })()`)) as string
  const file = path.join(userDir, name)
  fs.writeFileSync(file, Buffer.from(base64, 'base64'))
  return file
}

// Troca a janela "Abrir" do Windows (de arquivos ou de pasta): a próxima escolha devolve estes.
async function chooseFiles(app: ElectronApplication, files: string[]) {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: chosen })
  }, files)
}

// Anexa pelos canais de verdade: a janela "Abrir" (trocada) devolve os arquivos.
async function attach(app: ElectronApplication, page: Page, cardId: string, files: string[]) {
  await chooseFiles(app, files)
  const picked = await mello<{ token: string }[]>(page, 'files.pick', { imagesOnly: false })
  await mello(page, 'attachments.add', { cardId, tokens: picked.map((p) => p.token) })
  const detail = await mello<{ attachments: { name: string; fileId: string }[] }>(
    page,
    'cards.get',
    { cardId }
  )
  return Object.fromEntries(detail.attachments.map((a) => [a.name, a.fileId]))
}

// Um checklist com itens; done marca os primeiros, date dá a data (dias a partir de hoje) e time,
// a hora.
async function addChecklist(
  page: Page,
  cardId: string,
  title: string,
  items: { text: string; done?: boolean; date?: number; time?: string }[]
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
        due: {
          dueDate: item.time ? `${day(item.date)}T${item.time}` : day(item.date),
          showInCalendar: true
        }
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

// Os cards do quadro "Casa" que a fase do envelhecimento mexe.
interface Seeded {
  casa: Board
  cards: Record<
    'tinta' | 'torneira' | 'condominio' | 'armario' | 'pintar' | 'horta' | 'viagem' | 'revisao',
    string
  >
}

// Uma regra de repetição semanal, num dia da semana a N dias de hoje, às 08:00 (etapa 8).
function weeklyRule(targetListId: string, inDays: number) {
  const date = new Date()
  date.setDate(date.getDate() + inDays)
  return {
    freq: 'weekly',
    weekdays: 1 << date.getDay(),
    monthDay: null,
    intervalDays: null,
    time: '08:00',
    targetListId,
    copyLabelsPriority: true,
    copyDescription: true,
    copyChecklist: true,
    copyDueDate: true,
    ifPreviousOpen: 'skip',
    endsKind: 'never',
    endsOn: null,
    endsAfter: null
  }
}

async function seed(app: ElectronApplication, page: Page): Promise<Seeded> {
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
  const armario = await card(list('A fazer'), 'Organizar o armário')
  // Criado em "A fazer" e movido: a atividade mostra os dois registros, como na tela 4.
  const pintar = await card(list('A fazer'), 'Pintar o quarto')
  await mello(page, 'cards.move', { cardId: pintar, listId: list('Em andamento'), index: 0 })
  const lampadas = await card(list('A fazer'), 'Trocar as lâmpadas')
  const horta = await card(ideias.id, 'Horta na varanda')
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
    { text: 'Lixar as paredes', date: -1, time: '18:00' }
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
  await update(prova, { priority: 1, due: { dueAt: day(inMonth(2)), reminder: 'none' } })
  const trabalho = await card(estudosLists[0]!.id, 'Entregar trabalho')
  await mello(page, 'cards.setLabels', { cardId: trabalho, labelIds: [estudosLabels[3]] })
  await update(trabalho, { priority: 3, due: { dueAt: day(inMonth(4)), reminder: 'none' } })
  const curso = await card(estudosLists[1]!.id, 'Curso de inglês')
  await addChecklist(page, curso, 'Capítulos', [
    { text: 'Ler o capítulo 3', date: -3 },
    { text: 'Fazer os exercícios', date: 0 }
  ])

  // Etapa 8 (telas 6b, 9 e 5): "Compras da semana" se repete toda semana, no dia de depois de
  // amanhã, às 08:00. Na fase do relógio adiantado, ela fica em aberto e as repetições são puladas.
  const compras = await card(list('A fazer'), 'Compras da semana')
  await setLabels(compras, [laranja, roxo])
  await update(compras, { priority: 4, due: { dueAt: `${day(2)}T08:00`, reminder: 'at_time' } })
  await addChecklist(page, compras, 'Lista', [
    { text: 'Pão' },
    { text: 'Leite' },
    { text: 'Frutas' }
  ])
  await mello(page, 'recurrence.save', { cardId: compras, rule: weeklyRule(list('A fazer'), 2) })
  return {
    casa,
    cards: { tinta, torneira, condominio, armario, pintar, horta, viagem, revisao }
  }
}

// Etapa 6: o relógio de teste adianta 14 dias pelo atalho (Ctrl+Alt+→), e cada card é mexido num
// dia diferente (criar e excluir um checklist conta como alteração, ENV-05). No fim, os 5 níveis
// aparecem como no protótipo: tinta 5, condomínio 4, torneira 3, armário e viagem 2, pintar 1 e a
// horta nova. Os cards da lista "Concluído" não envelhecem.
async function ageCards(page: Page, cards: Seeded['cards']) {
  const touches: Record<number, string[]> = {
    2: [cards.condominio],
    4: [cards.torneira],
    7: [cards.armario, cards.viagem],
    10: [cards.pintar],
    13: [cards.horta]
  }
  for (let dayNumber = 1; dayNumber <= 14; dayNumber++) {
    await page.keyboard.press('Control+Alt+ArrowRight')
    const text = dayNumber === 1 ? 'Relógio +1 dia' : `Relógio +${dayNumber} dias`
    await page.getByText(text, { exact: true }).waitFor()
    for (const cardId of touches[dayNumber] ?? []) {
      const checklist = await mello<{ id: string }>(page, 'checklists.create', {
        cardId,
        title: 'Rascunho'
      })
      await mello(page, 'checklists.delete', { checklistId: checklist.id })
    }
  }
}

// Com a janela coberta por outra, ou o monitor desligado pelo Windows durante o roteiro, o
// Chromium para de desenhar e a captura não termina. Estas opções (só do script) mantêm a janela
// desenhando: sem o corte de janela escondida e sem esperar o sinal de atualização do monitor.
// A notificação do Windows vira uma anotação no main (melloNotifications), lida no fim.
async function launch(): Promise<{ app: ElectronApplication; page: Page }> {
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
    // Sem a emulação do Playwright (que força o tema claro): o tema é o que o app escolhe.
    colorScheme: null,
    env
  })
  const page = await app.firstWindow()
  await app.evaluate(({ BrowserWindow, Notification, shell }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900)
    const shown: string[] = []
    const opened: string[] = []
    Object.assign(globalThis, { melloNotifications: shown, melloOpened: opened })
    Notification.prototype.show = function show(this: Electron.Notification) {
      shown.push(`${this.title} — ${this.body}`)
    }
    shell.openPath = async (target) => {
      opened.push(target)
      return ''
    }
    shell.showItemInFolder = (target) => {
      opened.push(target)
    }
  })
  await page.waitForSelector('header')
  await page.evaluate('document.fonts.ready.then(() => true)')
  return { app, page }
}

// Espera uma condição de fora da tela (arquivos, o main), por até 15 s.
async function until(check: () => Promise<unknown> | unknown) {
  for (let waited = 0; !(await check()); waited += 100) {
    if (waited > 15_000) throw new Error('Tempo esgotado esperando o app.')
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

// O que o app mandou abrir no Explorer ou no programa padrão.
function opened(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(() => (globalThis as unknown as { melloOpened: string[] }).melloOpened)
}

// Restaurar e apagar tudo reiniciam o app: aqui só saem, e o script abre de novo.
async function restartFrom(app: ElectronApplication, action: () => Promise<void>) {
  await app.evaluate(({ app: electron }) => {
    electron.relaunch = () => {}
  })
  const closed = app.waitForEvent('close')
  await action()
  await closed
  return launch()
}

// Encerra como o "Sair" da bandeja: fechar a janela só a esconderia (P4).
async function quit(app: ElectronApplication) {
  const closed = app.waitForEvent('close').catch(() => {})
  await app.evaluate(({ app: electron }) => electron.quit()).catch(() => {})
  await closed
}

let { app, page } = await launch()

try {
  const info = await call<unknown>(page, 'window.mello.app.info()')
  if (!fs.existsSync(path.join(dataDir, 'mello.db'))) throw new Error('O banco não foi criado.')
  console.log(`Banco criado e IPC respondendo (${JSON.stringify(info)}).`)

  // O tema pela configuração de verdade (TEM-01): o main troca o tema do Chromium e a tela segue o
  // prefers-color-scheme.
  const setTheme = async (theme: string) => {
    await mello(page, 'settings.set', { key: 'theme', value: theme === 'claro' ? 'light' : 'dark' })
    await until(() => page.evaluate(`document.documentElement.classList.contains('tema-${theme}')`))
  }

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

  const { casa, cards } = await seed(app, page)
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

    // Tela 6b: o diálogo "Repetir card" de uma série semanal.
    await page.getByRole('link', { name: /Compras da semana/ }).click()
    const weekly = page.getByRole('dialog', { name: 'Compras da semana' })
    await weekly.waitFor()
    await weekly.getByRole('button', { name: 'Repetir' }).click()
    await page.getByRole('dialog', { name: 'Repetir card' }).waitFor()
    await page.waitForTimeout(250)
    await shot(page, '06b-repetir', theme)
    await closePopovers(page)
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
  }

  // Etapa 11: busca (tela 9) e modelos (telas 11 e 12). Um card-modelo no "Casa", um quadro-modelo
  // e uma tarefa com "viagem", para a busca ter os três grupos. No fim, tudo o que o bloco criou
  // sai, e as capturas seguintes continuam como antes.
  const casaLists = (
    await mello<{ lists: { id: string; title: string }[] }>(page, 'boards.get', {
      boardId: casa.id
    })
  ).lists
  const casaList = (title: string) => casaLists.find((l) => l.title === title)!.id
  const reservas = await mello<{ id: string }>(page, 'checklists.create', {
    cardId: cards.viagem,
    title: 'Reservas'
  })
  const reserva = await mello<{ id: string }>(page, 'items.create', {
    checklistId: reservas.id,
    text: 'Reservar a viagem de ida'
  })
  await mello(page, 'items.update', {
    itemId: reserva.id,
    due: { dueDate: day(5), showInCalendar: true }
  })
  const cardTemplate = await mello<{ id: string }>(page, 'cards.create', {
    listId: casaList('A fazer'),
    title: 'Checklist de viagem'
  })
  const green = (
    await mello<{ id: string; color: string }[]>(page, 'labels.list', { boardId: casa.id })
  ).find((l) => l.color === '#216e4e')!
  await mello(page, 'cards.setLabels', { cardId: cardTemplate.id, labelIds: [green.id] })
  await addChecklist(page, cardTemplate.id, 'Levar', [
    { text: 'Documentos' },
    { text: 'Carregador' },
    { text: 'Remédios' },
    { text: 'Roupas' }
  ])
  await mello(page, 'templates.setCard', { cardId: cardTemplate.id, isTemplate: true })
  const rotina = await mello<Board>(page, 'boards.create', { title: 'Rotina semanal' })
  await mello(page, 'boards.setBackground', {
    boardId: rotina.id,
    background: { kind: 'gradient', value: 'oceano' }
  })
  const rotinaFirst = (
    await mello<{ lists: { id: string }[] }>(page, 'boards.get', { boardId: rotina.id })
  ).lists[0]!.id
  for (const title of ['Planejar a semana', 'Revisar as finanças', 'Limpar a casa']) {
    await mello(page, 'cards.create', { listId: rotinaFirst, title })
  }
  await mello(page, 'templates.setBoard', { boardId: rotina.id, isTemplate: true })
  await page.evaluate('location.reload()')
  await page.waitForSelector('header')
  const templatesSection = page.getByRole('region', { name: 'MODELOS' })
  for (const theme of THEMES) {
    await setTheme(theme)
    await go(page, '#/')
    const searchBox = page.getByRole('combobox', { name: 'Pesquisar' })
    await searchBox.fill('viagem')
    await page
      .getByRole('listbox', { name: 'Resultados da busca' })
      .getByRole('option', { name: /Reservar a viagem/ })
      .waitFor()
    await searchBox.press('ArrowDown')
    await page.waitForTimeout(200)
    await shot(page, '09-busca', theme)
    await searchBox.press('Escape')
    await searchBox.fill('')
    await page.mouse.move(2, 600)
    await templatesSection.waitFor()
    await page.waitForTimeout(200)
    await shot(page, '11-modelos-de-quadro', theme)
    await templatesSection.getByRole('button', { name: 'Usar o modelo Rotina semanal' }).click()
    const templateDialog = page.getByRole('dialog', { name: 'Criar quadro a partir de modelo' })
    await templateDialog.waitFor()
    await page.waitForTimeout(200)
    await shot(page, '11-criar-quadro-de-modelo', theme)
    await templateDialog.getByRole('button', { name: 'Cancelar' }).click()

    await go(page, `#/boards/${casa.id}`)
    await page.getByRole('heading', { name: 'Casa' }).waitFor()
    await page
      .getByRole('region', { name: 'A fazer' })
      .getByRole('button', { name: 'Criar a partir de modelo' })
      .click()
    await page.getByRole('dialog', { name: 'Criar a partir de modelo' }).waitFor()
    await page.waitForTimeout(200)
    await shot(page, '12-modelos-de-card', theme)
    await closePopovers(page)
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await page
      .getByRole('dialog', { name: 'Criar' })
      .getByRole('button', { name: /Criar a partir de modelo/ })
      .click()
    await page.waitForTimeout(200)
    await shot(page, '09-criar-a-partir-de-modelo', theme)
    await closePopovers(page)
  }

  // MOD-03: o modelo escolhido no ícone da lista vira um card no fim daquela lista.
  await setTheme('escuro')
  const inProgress = page.getByRole('region', { name: 'Em andamento' })
  await inProgress.getByRole('button', { name: 'Criar a partir de modelo' }).click()
  await page
    .getByRole('dialog', { name: 'Criar a partir de modelo' })
    .getByRole('button', { name: /Checklist de viagem/ })
    .click()
  await inProgress.getByRole('link', { name: /Checklist de viagem/ }).waitFor()
  // MOD-05: o quadro novo a partir do modelo, com os cards.
  await go(page, '#/')
  await templatesSection.getByRole('button', { name: 'Usar o modelo Rotina semanal' }).click()
  const fromTemplate = page.getByRole('dialog', { name: 'Criar quadro a partir de modelo' })
  await fromTemplate.getByLabel('Título do quadro').fill('Rotina de novembro')
  await fromTemplate.getByRole('button', { name: 'Criar quadro' }).click()
  await page.getByRole('heading', { name: 'Rotina de novembro' }).waitFor()
  await page.getByRole('link', { name: 'Limpar a casa' }).waitFor()
  await page.waitForTimeout(300)
  await shot(page, '11-quadro-criado', 'escuro')
  const novembro = (await mello<Board[]>(page, 'boards.list', undefined)).find(
    (b) => b.title === 'Rotina de novembro'
  )!
  const created = await mello<{ lists: { title: string; cards: unknown[] }[] }>(
    page,
    'boards.get',
    { boardId: novembro.id }
  )
  console.log(
    `Quadro a partir de modelo: ${created.lists.map((l) => `${l.title} (${l.cards.length})`).join(', ')}`
  )
  const copies = (
    await mello<{ lists: { cards: { id: string; title: string; isTemplate: boolean }[] }[] }>(
      page,
      'boards.get',
      { boardId: casa.id }
    )
  ).lists.flatMap((l) => l.cards.filter((c) => c.title === 'Checklist de viagem'))
  console.log(
    `Card a partir de modelo: ${copies.length - 1} cópia, modelo ${copies.some((c) => c.isTemplate) ? 'mantido' : 'perdido'}.`
  )
  if (copies.length !== 2) throw new Error('A cópia do card-modelo não foi criada.')
  for (const copy of copies) await mello(page, 'cards.delete', { cardId: copy.id })
  await mello(page, 'checklists.delete', { checklistId: reservas.id })
  await mello(page, 'templates.setBoard', { boardId: rotina.id, isTemplate: false })
  for (const id of [novembro.id, rotina.id]) {
    await mello(page, 'boards.close', { boardId: id })
    await mello(page, 'boards.delete', { boardId: id })
  }
  await page.evaluate('location.reload()')
  await page.waitForSelector('header')

  // Etapa 10: Configurações (telas 7 e 15). O tema muda pelo próprio rádio da tela. Os backups da
  // lista são feitos agora, pelo canal de verdade.
  await mello(page, 'data.backupNow', undefined)
  await mello(page, 'data.backupNow', undefined)
  // O setTheme muda o tema por fora da tela: recarregar traz a configuração atual para os rádios.
  await go(page, '#/settings')
  await page.evaluate('location.reload()')
  await page.waitForSelector('header')
  const settingsNav = page.getByRole('navigation', { name: 'Seções de configurações' })
  // O rádio fica escondido dentro da prévia: o clique é no cartão do tema, como na tela.
  const pickTheme = (label: string) =>
    page.getByRole('radiogroup', { name: 'Tema' }).getByText(label, { exact: true }).click()
  const backupsTable = page.getByRole('table', { name: 'Backups guardados' })
  await backupsTable
    .getByRole('button', { name: /^Restaurar/ })
    .first()
    .waitFor()
  for (const theme of THEMES) {
    await settingsNav.getByRole('button', { name: 'Aparência' }).click()
    await pickTheme(theme === 'claro' ? 'Claro' : 'Escuro')
    await until(() => page.evaluate(`document.documentElement.classList.contains('tema-${theme}')`))
    await page.waitForTimeout(300)
    await shot(page, '07-configuracoes', theme)
    for (const [section, name] of [
      ['Calendário', '07-configuracoes-calendario'],
      ['Lembretes e bandeja', '15-lembretes-e-bandeja'],
      ['Dados e backup', '15-dados-e-backup']
    ]) {
      await settingsNav.getByRole('button', { name: section }).click()
      await page.waitForTimeout(250)
      await shot(page, name!, theme)
    }
    await page.getByRole('button', { name: 'Apagar tudo…' }).click()
    const deleteDialog = page.getByRole('alertdialog', { name: 'Apagar tudo?' })
    await deleteDialog.waitFor()
    await page.waitForTimeout(200)
    await shot(page, '15-apagar-tudo', theme)
    await deleteDialog.getByRole('button', { name: 'Cancelar' }).click()
    await backupsTable
      .getByRole('button', { name: /^Restaurar/ })
      .first()
      .click()
    const restoreDialog = page.getByRole('alertdialog', { name: 'Restaurar este backup?' })
    await restoreDialog.waitFor()
    await page.waitForTimeout(200)
    await shot(page, '15-restaurar', theme)
    await restoreDialog.getByRole('button', { name: 'Cancelar' }).click()
  }

  // TEM-03: "Igual ao sistema" segue o Windows; a classe da tela e o Electron têm de concordar.
  await settingsNav.getByRole('button', { name: 'Aparência' }).click()
  await pickTheme('Igual ao sistema')
  await page.waitForTimeout(300)
  const windowsDark = await app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors)
  const screenDark = await page.evaluate(
    "document.documentElement.classList.contains('tema-escuro')"
  )
  console.log(
    `"Igual ao sistema": Windows ${windowsDark ? 'escuro' : 'claro'}, tela ${screenDark ? 'escura' : 'clara'}.`
  )
  if (windowsDark !== screenDark) throw new Error('O tema da tela não seguiu o do Windows.')
  await setTheme('escuro')

  // DAD-07: exportar para uma pasta escolhida (a janela do Windows é trocada); o Explorer só fica
  // anotado.
  await chooseFiles(app, [userDir])
  await page.getByRole('button', { name: 'Exportar dados' }).click()
  await until(async () => (await opened(app)).some((target) => target.endsWith('dados.json')))
  const exported = fs.readdirSync(userDir).find((name) => name.startsWith('Mello-exportacao-'))
  if (!exported) throw new Error('A exportação não criou a pasta.')
  const json = JSON.parse(fs.readFileSync(path.join(userDir, exported, 'dados.json'), 'utf8'))
  const exportedFiles = fs.readdirSync(path.join(userDir, exported, 'arquivos')).length
  console.log(
    `Exportação: ${exported}, ${Object.keys(json.tabelas).length} tabelas, ${json.tabelas.card.length} cards, ${exportedFiles} arquivos; Explorer: ${(await opened(app)).join(', ')}`
  )

  // DAD-04: outra pasta de backup recebe um backup na hora; se ela some, o backup vai para a
  // padrão e a tela avisa. Depois a pasta padrão volta.
  const otherFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'mello-capturas-hd-'))
  await chooseFiles(app, [otherFolder])
  await page.getByRole('button', { name: 'Escolher pasta' }).click()
  await until(() =>
    page.evaluate(
      `document.querySelector('input[aria-label="Pasta de backup"]')?.value === ${JSON.stringify(otherFolder)}`
    )
  )
  console.log(`Backup na pasta escolhida: ${fs.readdirSync(otherFolder).join(', ')}`)
  fs.rmSync(otherFolder, { recursive: true, force: true })
  await page.getByRole('button', { name: 'Fazer backup agora' }).click()
  await page
    .getByText('A pasta de backup escolhida não está disponível', { exact: false })
    .first()
    .waitFor()
  await settingsNav.getByRole('button', { name: 'Dados e backup' }).click()
  await page.waitForTimeout(300)
  await shot(page, '15-pasta-indisponivel', 'escuro')
  await chooseFiles(app, [path.join(dataDir, 'backups')])
  await page.getByRole('button', { name: 'Escolher pasta' }).click()
  await page.getByRole('status').filter({ hasText: 'no mesmo disco' }).waitFor()
  await closePopovers(page)

  // Etapa 9: editor de fundo (tela 6). A janela "Abrir" (trocada) devolve a foto em retrato; a
  // tela lê os pixels pelo protocolo (com CORS) e calcula o ajuste automático (FUN-04).
  const mountains = await writeMountains(page, 'montanhas.jpg')
  const openEditor = async () => {
    await go(page, `#/boards/${casa.id}`)
    await page.getByRole('link', { name: 'Alterar fundo' }).click()
    const editor = page.getByRole('complementary', { name: 'Editor de fundo' })
    await editor.waitFor()
    return editor
  }
  const uploadMountains = async (editor: ReturnType<Page['getByRole']>) => {
    await editor.getByRole('tab', { name: 'Imagem' }).click()
    await chooseFiles(app, [mountains])
    await editor.getByRole('button', { name: /Enviar imagem/ }).click()
    await editor.getByText('Ajustado automaticamente').waitFor()
    await page.waitForTimeout(400)
  }
  for (const theme of THEMES) {
    await setTheme(theme)
    const editor = await openEditor()
    await page.waitForTimeout(300)
    await shot(page, '06-fundo-gradiente', theme)
    await editor.getByRole('tab', { name: 'Cor' }).click()
    await editor.getByRole('button', { name: 'Azul-petróleo' }).click()
    await shot(page, '06-fundo-cor', theme)
    await uploadMountains(editor)
    await shot(page, '06-fundo-imagem', theme)
    await editor.getByRole('slider', { name: /ESCURECER/ }).fill('0')
    await page.waitForTimeout(250)
    await shot(page, '06-fundo-ajuste-manual', theme)
    await editor.getByRole('link', { name: 'Cancelar' }).click()
    await page.getByRole('heading', { name: 'Casa' }).waitFor()
  }
  // Aplica a foto no quadro "Casa" (FUN-08): as capturas seguintes têm o fundo de imagem, como
  // as telas 2 e 8 do protótipo.
  await setTheme('escuro')
  await uploadMountains(await openEditor())
  await page.getByRole('button', { name: 'Aplicar ao quadro' }).click()
  await page.getByRole('heading', { name: 'Casa' }).waitFor()
  const applied = await mello<{ background: object; bgTone: string }>(page, 'boards.get', {
    boardId: casa.id
  })
  console.log(`Fundo aplicado: ${JSON.stringify(applied.background)}, tom ${applied.bgTone}`)
  for (const theme of THEMES) {
    await setTheme(theme)
    await go(page, `#/boards/${casa.id}`)
    await page.getByRole('heading', { name: 'Casa' }).waitFor()
    await page.waitForTimeout(400)
    await shot(page, '06-fundo-no-quadro', theme)
    await go(page, `#/boards/${casa.id}/calendar`)
    await page.getByRole('link', { name: /Consertar a torneira/ }).waitFor()
    await page.mouse.move(2, 600)
    await page.waitForTimeout(300)
    await shot(page, '06-fundo-calendario', theme)
    await go(page, '#/')
    await page.getByRole('button', { name: 'Criar novo quadro' }).waitFor()
    await page.waitForTimeout(300)
    await shot(page, '06-fundo-miniatura', theme)
  }

  // Etapa 6: envelhecimento (telas 2 e 8, e o indicador da tela 4). O selo do relógio de teste
  // aparece numa captura própria e fica escondido nas outras, para comparar com o protótipo.
  await setTheme('escuro')
  await go(page, `#/boards/${casa.id}`)
  await page.getByRole('heading', { name: 'Casa' }).waitFor()
  await ageCards(page, cards)
  // Os cards foram mexidos pelo window.mello, sem passar pela tela: recarregar busca o quadro de
  // novo (o relógio adiantado fica no main e volta junto).
  await page.evaluate('location.reload()')
  await page.getByText('Relógio +14 dias', { exact: true }).waitFor()
  await shot(page, '06-relogio-de-teste', 'escuro')
  await page.addStyleTag({ content: '[data-dev-clock] { display: none }' })
  for (const theme of THEMES) {
    await setTheme(theme)
    await page
      .getByRole('link', { name: /Comprar tinta para o quarto.*parado há 14 dias/ })
      .waitFor()
    await shot(page, theme === 'claro' ? '08-envelhecimento' : '02-envelhecimento', theme)
    await dragShot(
      page,
      /Pagar o condomínio/,
      { list: 'Em andamento', dy: 170 },
      '03-arrasto-envelhecido',
      theme
    )
    for (const [title, name] of [
      ['Consertar a torneira da cozinha', '04-envelhecimento-modal'],
      ['Revisão semanal', '04-envelhecimento-congelado']
    ]) {
      await page.getByRole('link', { name: new RegExp(title!) }).click()
      await page.getByRole('dialog', { name: title }).waitFor()
      await page.waitForTimeout(300)
      await shot(page, name!, theme)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(250)
    }

    // Etapa 8 (telas 9 e 5): com o relógio 14 dias à frente, "Compras da semana" ficou em aberto
    // e as repetições foram puladas: o aviso no card e as tracejadas no calendário.
    await page
      .getByRole('link', { name: /Compras da semana/ })
      .first()
      .click()
    const skipped = page.getByRole('dialog', { name: 'Compras da semana' })
    await skipped.getByText(/pulada\./).waitFor()
    await page.waitForTimeout(300)
    await shot(page, '09-repeticao-pulada', theme)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
    await go(page, `#/boards/${casa.id}/calendar`)
    await page
      .getByRole('link', { name: /Pulada: a anterior está em aberto/ })
      .first()
      .waitFor()
    await page.mouse.move(2, 600)
    await page.waitForTimeout(300)
    await shot(page, '05-calendario-repeticoes', theme)
    await go(page, `#/boards/${casa.id}`)
  }

  // Etapa 8 (LEM-03): os lembretes que venceram enquanto o relógio andou viraram notificações.
  const shown = await app.evaluate(
    () => (globalThis as unknown as { melloNotifications: string[] }).melloNotifications
  )
  console.log(`Notificações de lembretes com o relógio adiantado: ${shown.length}`)
  for (const text of shown) console.log(`  ${text}`)
  if (shown.length === 0) throw new Error('Nenhum lembrete virou notificação.')

  // Etapa 8 (tela 16): os lembretes perdidos com o app fechado e o aviso da bandeja, numa segunda
  // abertura. O relógio volta ao real e dois lembretes de ontem ficam pendentes.
  await mello(page, 'dev.setClock', { offset: 0 })
  const firstList = (
    await mello<{ lists: { id: string }[] }>(page, 'boards.get', { boardId: casa.id })
  ).lists[0]!.id
  for (const [title, dueAt] of [
    ['Pagar a internet', `${day(-1)}T18:00`],
    ['Renovar o seguro do carro', day(-1)]
  ]) {
    const created = await mello<{ id: string }>(page, 'cards.create', { listId: firstList, title })
    await mello(page, 'cards.update', { cardId: created.id, due: { dueAt, reminder: 'at_time' } })
  }
  await quit(app)
  ;({ app, page } = await launch())
  const missedNotice = page.getByRole('dialog', { name: /Você perdeu/ })
  await missedNotice.waitFor({ timeout: 15_000 })
  for (const theme of THEMES) {
    await setTheme(theme)
    await page.waitForTimeout(200)
    await shot(page, '16-lembretes-perdidos', theme)
  }
  await missedNotice.getByRole('button', { name: 'Dispensar' }).click()

  // Fechar a janela pela primeira vez: o aviso da bandeja; "Entendi" esconde a janela.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
  const trayNotice = page.getByRole('dialog', { name: 'O Mello continua na bandeja' })
  await trayNotice.waitFor()
  for (const theme of THEMES) {
    await setTheme(theme)
    await page.waitForTimeout(200)
    await shot(page, '16-aviso-da-bandeja', theme)
  }
  await trayNotice.getByRole('button', { name: 'Entendi' }).click()
  await page.waitForTimeout(500)
  const visible = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.isVisible()
  )
  if (visible) throw new Error('Depois do "Entendi", a janela devia estar escondida na bandeja.')
  console.log('Fechar a janela deixou o Mello na bandeja (janela escondida, app rodando).')

  // Etapa 10 (DAD-06): restaurar no app de verdade. O backup guarda o estado de agora; o quadro
  // criado depois dele some, e o estado de antes de restaurar vira um backup.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.show())
  await setTheme('escuro')
  await mello(page, 'data.backupNow', undefined)
  await mello(page, 'boards.create', { title: 'Criado depois do backup' })
  await go(page, '#/settings')
  ;({ app, page } = await restartFrom(app, async () => {
    await page
      .getByRole('table', { name: 'Backups guardados' })
      .getByRole('button', { name: /^Restaurar/ })
      .first()
      .click()
    await page
      .getByRole('alertdialog', { name: 'Restaurar este backup?' })
      .getByRole('button', { name: 'Restaurar' })
      .click()
  }))
  const restoredTitles = (await mello<{ title: string }[]>(page, 'boards.list', undefined)).map(
    (board) => board.title
  )
  const afterRestore = await mello<{ backups: { kind: string }[] }>(page, 'data.backups', undefined)
  console.log(
    `Restaurado: quadros ${restoredTitles.join(', ')}; backups ${afterRestore.backups.map((b) => b.kind).join(', ')}`
  )
  if (restoredTitles.includes('Criado depois do backup')) {
    throw new Error('A restauração não voltou ao estado do backup.')
  }
  if (afterRestore.backups[0]?.kind !== 'restore') {
    throw new Error('Faltou o backup de antes de restaurar.')
  }

  // DAD-09: apagar tudo, sem os backups. O app abre vazio, sem arquivos, e os backups ficam.
  await go(page, '#/settings')
  await page.getByRole('button', { name: 'Apagar tudo…' }).click()
  const deleteAll = page.getByRole('alertdialog', { name: 'Apagar tudo?' })
  await deleteAll.getByRole('textbox', { name: 'Digite APAGAR para confirmar' }).fill('APAGAR')
  await page.waitForTimeout(200)
  await shot(page, '15-apagar-tudo-confirmado', 'escuro')
  ;({ app, page } = await restartFrom(app, () =>
    deleteAll.getByRole('button', { name: 'Apagar tudo' }).click()
  ))
  await page.getByText('Nenhum quadro ainda').waitFor()
  const leftFiles = fs.readdirSync(path.join(dataDir, 'arquivos')).length
  const leftBackups = fs.readdirSync(path.join(dataDir, 'backups')).filter((n) => n.endsWith('.db'))
  console.log(
    `Apagar tudo: app vazio, ${leftFiles} arquivos, ${leftBackups.length} backups guardados.`
  )
  if (leftFiles > 0 || leftBackups.length === 0) throw new Error('Apagar tudo não fez o que devia.')

  // Etapa 12: desempenho com 500 cards (125 em cada lista). Mede o tempo de recarregar a tela até
  // o último card aparecer, com os cards novos e depois com todos envelhecidos (relógio +14 dias,
  // o fog() em todos). Fica no fim, depois do "Apagar tudo": o relógio adiantado mexeria nas
  // repetições e nos lembretes das capturas de antes.
  const perf = await mello<Board>(page, 'boards.create', { title: 'Desempenho' })
  const perfLists = (
    await mello<{ lists: { id: string }[] }>(page, 'boards.get', { boardId: perf.id })
  ).lists.map((l) => l.id)
  await page.evaluate(`(async () => {
    const lists = ${JSON.stringify(perfLists)}
    for (let i = 0; i < 500; i++) {
      await window.mello.cards.create({ listId: lists[i % lists.length], title: 'Card ' + (i + 1) })
    }
  })()`)
  const timeBoard = async (label: string) => {
    await go(page, `#/boards/${perf.id}`)
    const started = Date.now()
    await page.evaluate('location.reload()')
    await page.getByRole('link', { name: /^Card 500\b/ }).waitFor({ timeout: 60_000 })
    const ms = Date.now() - started
    console.log(`Desempenho, ${label}: ${ms} ms do recarregar ao card 500`)
    return ms
  }
  await setTheme('escuro')
  const fresh = await timeBoard('500 cards novos')
  await mello(page, 'dev.setClock', { offset: 14 * 86_400_000 })
  const aged = await timeBoard('500 cards envelhecidos (nível 5)')
  await page.addStyleTag({ content: '[data-dev-clock] { display: none }' })
  await page.waitForTimeout(300)
  await shot(page, '02-desempenho-500-cards', 'escuro')
  await mello(page, 'dev.setClock', { offset: 0 })
  await mello(page, 'boards.close', { boardId: perf.id })
  await mello(page, 'boards.delete', { boardId: perf.id })
  if (Math.max(fresh, aged) > 10_000) throw new Error('O quadro com 500 cards demorou demais.')
} finally {
  await quit(app)
  fs.rmSync(dataDir, { recursive: true, force: true })
  fs.rmSync(userDir, { recursive: true, force: true })
}
