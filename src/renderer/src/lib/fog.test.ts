// ENV-09: o fog() é o do protótipo. A cópia abaixo é a função de Quadro.dc.html com a mesma lógica
// (só ganhou os tipos e a formatação do projeto); o nosso, com o tamanho do protótipo e as cores do
// tema no lugar das variáveis, tem de dar exatamente o mesmo desenho.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fog } from './fog'

function prototypeFog(level: number, seed: string, claro: boolean) {
  const G = claro
    ? ['#ffffff', '#f1f2f4', '#e7e9ec', '#dde0e4', '#d3d7dc', '#c9cdd3']
    : ['#22272b', '#2c3035', '#35383d', '#3d3f44', '#45464b', '#4c4d52']
  const WORN = '#d8bd9b'
  if (!level) return G[0]
  let s = 0
  for (const ch of seed + level) s = (s * 31 + ch.charCodeAt(0)) >>> 0
  const R = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  const k = level / 5,
    g = G[level],
    rb = 19 + 5 * k,
    gap = 6 * k * k,
    L: string[] = []
  const f = (n: number) => n.toFixed(1)
  const blob = (x: string, y: string, r: number) =>
    'radial-gradient(circle ' +
    f(r) +
    'px at ' +
    x +
    ' ' +
    y +
    ', ' +
    g +
    ' ' +
    f(r - 4.5) +
    'px, transparent ' +
    f(r + 2) +
    'px)'
  const edge = (len: number, place: (p: number, o: number) => [string, string]) => {
    let p = -rb * 0.2
    while (p < len + rb * 0.2) {
      const r = rb * (0.75 + R() * 0.5)
      const off = gap + r * (0.5 + 0.5 * k) * (0.9 + R() * 0.25)
      L.push(blob(...place(p, off), r))
      L.push(blob(...place(p + r * 0.7, off + r * 0.8), r * 1.1))
      p += r * (1.2 + 0.3 * k + R() * 0.35)
    }
  }
  edge(252, (p, o) => [f(p) + 'px', f(o) + 'px'])
  edge(252, (p, o) => [f(p) + 'px', 'calc(100% - ' + f(o) + 'px)'])
  edge(100, (p, o) => [f(o) + 'px', f(p) + 'px'])
  edge(100, (p, o) => ['calc(100% - ' + f(o) + 'px)', f(p) + 'px'])
  const ins = (2 * (gap + rb * 1.6)).toFixed(0)
  L.push(
    'linear-gradient(' +
      g +
      ',' +
      g +
      ') center/calc(100% - ' +
      ins +
      'px) calc(100% - ' +
      ins +
      'px) no-repeat'
  )
  return L.join(', ') + ', ' + WORN
}

// As cores de cada nível no tema, lidas de themes.css.
const themes = fs.readFileSync(path.join(__dirname, '../styles/themes.css'), 'utf8')
function themeColors(theme: 'tema-escuro' | 'tema-claro') {
  const block = new RegExp(`\\.${theme} \\{([^}]*)\\}`).exec(themes)![1]!
  const value = (name: string) => new RegExp(`--${name}: (#[0-9a-f]{6});`).exec(block)![1]!
  return { fog: [1, 2, 3, 4, 5].map((n) => value(`fog${n}`)), tone: value('aging-tone') }
}

function withColors(css: string, colors: ReturnType<typeof themeColors>) {
  return css
    .replace(/var\(--fog(\d)\)/g, (_, n: string) => colors.fog[Number(n) - 1]!)
    .replace('var(--aging-tone)', colors.tone)
}

const SEED = 'c6f8a1de-3b7e-4c1a-9f2d-0a5b7c9e1f23'

describe('fog() do envelhecimento (ENV-09)', () => {
  it.each([
    ['tema-escuro', false],
    ['tema-claro', true]
  ] as const)('no tamanho do protótipo, é o desenho do protótipo (%s)', (theme, claro) => {
    const colors = themeColors(theme)
    for (const level of [1, 2, 3, 4, 5]) {
      for (const seed of [SEED, 'Compras', 'Começar o projeto MELLO']) {
        expect(withColors(fog(level, seed, 252, 100)!, colors)).toBe(
          prototypeFog(level, seed, claro)
        )
      }
    }
  })

  it('nível 0 é o card normal', () => {
    expect(fog(0, SEED, 252, 100)).toBeNull()
  })

  it('a mesma semente dá o mesmo desenho; outra semente, outro desenho', () => {
    expect(fog(3, SEED, 256, 120)).toBe(fog(3, SEED, 256, 120))
    expect(fog(3, SEED, 256, 120)).not.toBe(fog(3, 'outro-card', 256, 120))
    expect(fog(3, SEED, 256, 120)).not.toBe(fog(4, SEED, 256, 120))
  })

  it('card com menos de 100 px: as manchas encolhem na proporção da altura (26/10/2026)', () => {
    const firstRadius = (height: number) =>
      Number(/circle ([\d.]+)px/.exec(fog(5, SEED, 256, height)!)![1])
    expect(firstRadius(50)).toBeCloseTo(firstRadius(100) / 2, 0)
    expect(firstRadius(38)).toBeCloseTo(firstRadius(100) * 0.38, 0)
    // De 100 px para cima, o desenho das bordas de cima e de baixo não muda.
    expect(firstRadius(300)).toBe(firstRadius(100))
    // Card sem tamanho (ainda não medido) não trava: usa o menor encolhimento.
    expect(fog(5, SEED, 256, 0)).toContain('radial-gradient')
  })

  it('usa o tamanho real: um card mais alto tem manchas até embaixo nas laterais', () => {
    const layers = (height: number) => fog(5, SEED, 256, height)!.split('radial-gradient').length
    expect(layers(300)).toBeGreaterThan(layers(100))
    // As manchas da borda esquerda descem bem além dos 100 px do protótipo.
    const lefts = [...fog(5, SEED, 256, 300)!.matchAll(/at ([\d.]+)px ([\d.]+)px/g)]
    expect(Math.max(...lefts.map((m) => Number(m[2])))).toBeGreaterThan(200)
  })
})
