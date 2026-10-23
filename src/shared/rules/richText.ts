// Texto rico da descrição (NOT-07) e, na etapa 5, da nota (NOT-04). A tela edita com o TipTap e
// manda o documento dele (JSON). O main passa o documento por clean(), que só deixa o que a NOT-04
// permite, e gera o HTML guardado no banco com toHtml(): título (h3), parágrafo, negrito, itálico,
// lista, lista de tarefas e link http, https ou mailto. Como o HTML é escrito aqui, a partir de uma
// lista fechada de marcas e com o texto escapado, nada de fora (script, onerror, javascript:)
// chega ao banco. O TipTap, ao abrir o HTML, também só aceita o que está no esquema dele.

export interface RichMark {
  type: 'bold' | 'italic' | 'link'
  attrs?: { href: string }
}

export interface RichNode {
  type: string
  text?: string
  marks?: RichMark[]
  attrs?: { level?: number; checked?: boolean }
  content?: RichNode[]
}

export interface RichDoc {
  type: 'doc'
  content: RichNode[]
}

export const EMPTY_DOC: RichDoc = { type: 'doc', content: [] }

// Listas dentro de listas, até este limite.
const MAX_DEPTH = 12

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const children = (value: unknown): unknown[] =>
  isObject(value) && Array.isArray(value['content']) ? value['content'] : []

// NOT-04: só links http, https e mailto.
export function safeHref(href: unknown): string | null {
  if (typeof href !== 'string') return null
  const trimmed = href.trim()
  return /^(https?:\/\/|mailto:)/i.test(trimmed) ? trimmed : null
}

function cleanMarks(value: unknown): RichMark[] {
  if (!Array.isArray(value)) return []
  const marks: RichMark[] = []
  for (const mark of value) {
    if (!isObject(mark)) continue
    const type = mark['type']
    if ((type === 'bold' || type === 'italic') && !marks.some((m) => m.type === type)) {
      marks.push({ type })
    } else if (type === 'link' && !marks.some((m) => m.type === 'link')) {
      const href = safeHref(isObject(mark['attrs']) ? mark['attrs']['href'] : undefined)
      if (href) marks.push({ type: 'link', attrs: { href } })
    }
  }
  return marks
}

function cleanInline(nodes: unknown[]): RichNode[] {
  const inline: RichNode[] = []
  for (const node of nodes) {
    if (!isObject(node)) continue
    if (node['type'] === 'hardBreak') {
      inline.push({ type: 'hardBreak' })
    } else if (node['type'] === 'text' && typeof node['text'] === 'string' && node['text']) {
      const marks = cleanMarks(node['marks'])
      inline.push(
        marks.length
          ? { type: 'text', text: node['text'], marks }
          : { type: 'text', text: node['text'] }
      )
    }
  }
  return inline
}

// Itens de lista começam com um parágrafo (é o que o TipTap espera).
function cleanItem(node: unknown, type: 'listItem' | 'taskItem', depth: number): RichNode {
  const content = cleanBlocks(children(node), depth + 1)
  if (content[0]?.type !== 'paragraph') content.unshift({ type: 'paragraph', content: [] })
  if (type === 'listItem') return { type, content }
  const attrs = isObject(node) && isObject(node['attrs']) ? node['attrs'] : {}
  return { type, attrs: { checked: attrs['checked'] === true }, content }
}

function cleanBlocks(nodes: unknown[], depth: number): RichNode[] {
  if (depth > MAX_DEPTH) return []
  const blocks: RichNode[] = []
  for (const node of nodes) {
    if (!isObject(node)) continue
    const type = node['type']
    if (type === 'paragraph') {
      blocks.push({ type, content: cleanInline(children(node)) })
    } else if (type === 'heading') {
      blocks.push({ type, attrs: { level: 3 }, content: cleanInline(children(node)) })
    } else if (type === 'bulletList' || type === 'taskList') {
      const itemType = type === 'bulletList' ? 'listItem' : 'taskItem'
      const items = children(node)
        .filter((item) => isObject(item) && item['type'] === itemType)
        .map((item) => cleanItem(item, itemType, depth))
      if (items.length) blocks.push({ type, content: items })
    }
  }
  return blocks
}

// Fica só o que a NOT-04 permite; o resto é descartado.
export function clean(input: unknown): RichDoc {
  if (!isObject(input) || input['type'] !== 'doc') return EMPTY_DOC
  return { type: 'doc', content: cleanBlocks(children(input), 0) }
}

function escape(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function inlineHtml(nodes: RichNode[] = []): string {
  return nodes
    .map((node) => {
      if (node.type === 'hardBreak') return '<br>'
      let html = escape(node.text ?? '')
      const has = (type: RichMark['type']) => node.marks?.find((m) => m.type === type)
      if (has('italic')) html = `<em>${html}</em>`
      if (has('bold')) html = `<strong>${html}</strong>`
      const link = has('link')
      if (link?.attrs) {
        html = `<a href="${escape(link.attrs.href)}" target="_blank" rel="noopener noreferrer nofollow">${html}</a>`
      }
      return html
    })
    .join('')
}

function blocksHtml(nodes: RichNode[] = []): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'paragraph':
          return `<p>${inlineHtml(node.content)}</p>`
        case 'heading':
          return `<h3>${inlineHtml(node.content)}</h3>`
        case 'bulletList':
          return `<ul>${blocksHtml(node.content)}</ul>`
        case 'listItem':
          return `<li>${blocksHtml(node.content)}</li>`
        case 'taskList':
          return `<ul data-type="taskList">${blocksHtml(node.content)}</ul>`
        case 'taskItem':
          return `<li data-type="taskItem" data-checked="${node.attrs?.checked ? 'true' : 'false'}">${blocksHtml(node.content)}</li>`
        default:
          return ''
      }
    })
    .join('')
}

// O HTML guardado no banco. Um documento sem texto vira "" (campo vazio).
export function toHtml(doc: RichDoc): string {
  return toText(doc).trim() === '' ? '' : blocksHtml(doc.content)
}

// Texto puro, para o filtro do quadro e a busca: um bloco por linha.
export function toText(doc: RichDoc): string {
  const lines: string[] = []
  const walk = (nodes: RichNode[] = []) => {
    for (const node of nodes) {
      if (node.type === 'paragraph' || node.type === 'heading') {
        lines.push(
          (node.content ?? []).map((n) => (n.type === 'hardBreak' ? '\n' : (n.text ?? ''))).join('')
        )
      } else {
        walk(node.content)
      }
    }
  }
  walk(doc.content)
  return lines.join('\n')
}
