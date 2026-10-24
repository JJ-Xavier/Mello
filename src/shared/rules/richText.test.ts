import { describe, expect, it } from 'vitest'
import { clean, safeHref, textLength, toHtml, toText } from './richText'

const doc = (...content: unknown[]) => ({ type: 'doc', content })
const p = (...content: unknown[]) => ({ type: 'paragraph', content })
const text = (value: string, marks?: unknown[]) => ({ type: 'text', text: value, marks })

describe('texto rico (NOT-04, NOT-07)', () => {
  it('as marcas permitidas viram o HTML do TipTap', () => {
    const html = toHtml(
      clean(
        doc(
          { type: 'heading', attrs: { level: 3 }, content: [text('Compras')] },
          p(
            text('negrito', [{ type: 'bold' }]),
            text(' e '),
            text('itálico', [{ type: 'italic' }])
          ),
          {
            type: 'bulletList',
            content: [{ type: 'listItem', content: [p(text('pão'))] }]
          },
          {
            type: 'taskList',
            content: [
              { type: 'taskItem', attrs: { checked: true }, content: [p(text('leite'))] },
              { type: 'taskItem', attrs: { checked: false }, content: [p(text('café'))] }
            ]
          },
          p(text('site', [{ type: 'link', attrs: { href: 'https://exemplo.com' } }]))
        )
      )
    )
    expect(html).toBe(
      '<h3>Compras</h3>' +
        '<p><strong>negrito</strong> e <em>itálico</em></p>' +
        '<ul><li><p>pão</p></li></ul>' +
        '<ul data-type="taskList">' +
        '<li data-type="taskItem" data-checked="true"><p>leite</p></li>' +
        '<li data-type="taskItem" data-checked="false"><p>café</p></li></ul>' +
        '<p><a href="https://exemplo.com" target="_blank" rel="noopener noreferrer nofollow">site</a></p>'
    )
  })

  it('o texto é escapado: <script> e onerror chegam como texto, nunca como marca', () => {
    const html = toHtml(
      clean(doc(p(text('<script>alert(1)</script><img src=x onerror=alert(1)>'))))
    )
    expect(html).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;</p>'
    )
  })

  it('link só http, https ou mailto; javascript: e data: são descartados', () => {
    expect(safeHref('https://a.com')).toBe('https://a.com')
    expect(safeHref(' mailto:eu@exemplo.com ')).toBe('mailto:eu@exemplo.com')
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('JaVaScRiPt:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,oi')).toBeNull()
    expect(safeHref('/caminho')).toBeNull()
    const html = toHtml(
      clean(doc(p(text('x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]))))
    )
    expect(html).toBe('<p>x</p>')
    const quoted = toHtml(
      clean(doc(p(text('x', [{ type: 'link', attrs: { href: 'https://a.com/"onmouseover="x' } }]))))
    )
    expect(quoted).toContain('href="https://a.com/&quot;onmouseover=&quot;x"')
  })

  it('nós e marcas fora da lista são descartados; título vira sempre h3', () => {
    const cleaned = clean(
      doc(
        { type: 'codeBlock', content: [text('código')] },
        { type: 'blockquote', content: [p(text('citação'))] },
        { type: 'image', attrs: { src: 'x' } },
        { type: 'heading', attrs: { level: 1 }, content: [text('Título')] },
        p(text('riscado', [{ type: 'strike' }, { type: 'bold' }]), { type: 'mention' })
      )
    )
    expect(toHtml(cleaned)).toBe('<h3>Título</h3><p><strong>riscado</strong></p>')
  })

  it('entrada que não é documento vira documento vazio', () => {
    for (const input of [null, 'html', 42, [], { type: 'paragraph' }]) {
      expect(clean(input)).toEqual({ type: 'doc', content: [] })
    }
  })

  it('item de lista sempre começa com parágrafo; listas vazias somem', () => {
    const cleaned = clean(
      doc(
        { type: 'bulletList', content: [{ type: 'listItem', content: [] }] },
        { type: 'bulletList', content: [{ type: 'paragraph' }] }
      )
    )
    expect(cleaned.content).toEqual([
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [] }] }]
      }
    ])
  })

  it('texto puro: uma linha por bloco; sem texto, o HTML fica vazio', () => {
    const value = clean(
      doc(p(text('a'), { type: 'hardBreak' }, text('b')), {
        type: 'taskList',
        content: [{ type: 'taskItem', attrs: { checked: false }, content: [p(text('c'))] }]
      })
    )
    expect(toText(value)).toBe('a\nb\nc')
    expect(toHtml(clean(doc(p(), p(text('  ')))))).toBe('')
  })

  it('listas aninhadas demais são cortadas', () => {
    let nested: unknown = p(text('fundo'))
    for (let i = 0; i < 40; i++) {
      nested = { type: 'bulletList', content: [{ type: 'listItem', content: [p(), nested] }] }
    }
    expect(toText(clean(doc(nested)))).not.toContain('fundo')
  })

  it('o tamanho conta os textos e as quebras de linha, não a passagem entre blocos', () => {
    const value = clean(
      doc(p(text('abc'), { type: 'hardBreak' }, text('de')), {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [p(text('fg'))] }]
      })
    )
    expect(textLength(value)).toBe(8)
    expect(toText(value)).toHaveLength(9)
  })
})
