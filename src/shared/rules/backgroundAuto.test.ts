import { describe, expect, it } from 'vitest'
import { focusPosition, visibleArea } from './background'
import {
  analyzeBackground,
  estimatedContrast,
  isLegible,
  SAMPLE_HEIGHT,
  SAMPLE_WIDTH
} from './backgroundAuto'

// Imagens sintéticas de 64 × 40, como a cópia reduzida que a tela tira no envio.
function image(pixel: (x: number, y: number) => [number, number, number]): number[] {
  const rgb: number[] = []
  for (let y = 0; y < SAMPLE_HEIGHT; y++) {
    for (let x = 0; x < SAMPLE_WIDTH; x++) rgb.push(...pixel(x, y))
  }
  return rgb
}
const flat = (value: number) => image(() => [value, value, value])
const checker = (x: number, y: number): [number, number, number] =>
  (x + y) % 2 ? [255, 255, 255] : [0, 0, 0]

describe('ajuste automático da imagem (FUN-04)', () => {
  it('foto clara: o menor escurecer, de 2 em 2%, que deixa o texto branco legível', () => {
    const light = flat(230)
    const { auto } = analyzeBackground(light)
    expect(auto).toEqual({ focus: 4, zoom: 100, dim: 50, blur: 0 })
    expect(isLegible(light, 50, 0)).toBe(true)
    expect(isLegible(light, 48, 0)).toBe(false)
  })

  it('foto escura não escurece; branca pura precisa de 54%', () => {
    expect(analyzeBackground(flat(32)).auto.dim).toBe(0)
    expect(analyzeBackground(flat(255)).auto.dim).toBe(54)
    // Metade branca e metade preta: as partes claras pesam, e o escurecer é o mesmo da branca.
    const half = image((x) => (x < 32 ? [255, 255, 255] : [0, 0, 0]))
    expect(analyzeBackground(half).auto.dim).toBe(54)
  })

  it('detalhe concentrado num canto: o foco vai para lá, com zoom de 112%', () => {
    const corner = image((x, y) => (x >= 43 && y < 13 ? checker(x, y) : [40, 40, 40]))
    expect(analyzeBackground(corner).auto).toMatchObject({ focus: 2, zoom: 112 })
  })

  it('detalhe espalhado por igual é empate: o foco fica no centro', () => {
    const even = image((x, y) => (((x >> 1) + (y >> 1)) % 2 ? [200, 200, 200] : [60, 60, 60]))
    expect(analyzeBackground(even).auto).toMatchObject({ focus: 4, zoom: 100 })
    expect(analyzeBackground(flat(128)).auto.focus).toBe(4)
  })

  it('imagem carregada ganha 6 px de desfoque; lisa, nenhum', () => {
    expect(analyzeBackground(image(checker)).auto.blur).toBe(6)
    expect(analyzeBackground(flat(200)).auto.blur).toBe(0)
  })

  it('a cor média, para o tom do envelhecimento (FUN-09)', () => {
    const red = image(() => [200, 40, 0])
    expect(analyzeBackground(red).avgColor).toBe('#c82800')
  })
})

describe('indicador de legibilidade (FUN-06)', () => {
  it('contraste de pelo menos 4,5:1; escurecer e desfoque ajudam', () => {
    const half = image((x) => (x < 32 ? [255, 255, 255] : [0, 0, 0]))
    expect(isLegible(half, 40, 0)).toBe(false)
    expect(estimatedContrast(half, 40, 20)).toBeGreaterThan(estimatedContrast(half, 40, 0))
    expect(isLegible(half, 40, 20)).toBe(true)
    expect(isLegible(half, 70, 0)).toBe(true)
  })
})

describe('enquadramento da imagem (FUN-03)', () => {
  it('o foco alinha a imagem pela coluna e pela linha da grade 3 × 3', () => {
    expect(focusPosition(0)).toEqual({ x: '0%', y: '0%' })
    expect(focusPosition(4)).toEqual({ x: '50%', y: '50%' })
    expect(focusPosition(5)).toEqual({ x: '100%', y: '50%' })
    expect(focusPosition(7)).toEqual({ x: '50%', y: '100%' })
  })

  it('o recorte de uma foto em retrato numa tela 16:10, no centro e no alto', () => {
    const center = visibleArea(1080, 1920, 4, 100)
    expect(center.width).toBe(1)
    expect(center.height).toBeCloseTo(0.5625 / 1.6)
    expect(center.top).toBeCloseTo((1 - 0.5625 / 1.6) / 2)
    expect(visibleArea(1080, 1920, 1, 100).top).toBe(0)
  })

  it('o zoom aproxima a partir do foco', () => {
    const area = visibleArea(1600, 1000, 8, 200)
    expect(area).toEqual({ left: 0.5, top: 0.5, width: 0.5, height: 0.5 })
    expect(visibleArea(1600, 1000, 4, 200)).toEqual({
      left: 0.25,
      top: 0.25,
      width: 0.5,
      height: 0.5
    })
  })
})
