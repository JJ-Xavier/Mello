import { describe, expect, it } from 'vitest'
import { BOARD_COLORS, BOARD_GRADIENTS, backgroundCss } from './background'
import { agingTone, averageColor, toneForBackground } from './tone'

function hsl(hex: string): { s: number; l: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number
  ]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min)
  return { s, l }
}

describe('tom do envelhecimento (FUN-09)', () => {
  it('a média de um gradiente é a média simples das paradas', () => {
    expect(averageColor(['#000000', '#ffffff'])).toBe('#808080')
    expect(averageColor(['#1f5eff', '#4d8dff', '#eef1f6'])).toBe('#739ffc')
  })

  it('fixa a luminosidade em 73% e limita a saturação a 45%', () => {
    for (const color of [...BOARD_COLORS.map((c) => c.hex), '#ff0000', '#00ff00', '#123456']) {
      const tone = hsl(agingTone(color))
      expect(tone.l).toBeCloseTo(0.73, 2)
      expect(tone.s).toBeLessThanOrEqual(0.45 + 0.01)
    }
  })

  it('o bege do protótipo (saturação 44%, luminosidade 72,7%) quase não muda', () => {
    const tone = agingTone('#d8bd9b')
    for (const i of [1, 3, 5]) {
      const diff = parseInt(tone.slice(i, i + 2), 16) - parseInt('#d8bd9b'.slice(i, i + 2), 16)
      expect(Math.abs(diff)).toBeLessThanOrEqual(2)
    }
  })

  it('cinza continua cinza', () => {
    expect(agingTone('#2c2c2c')).toBe('#bababa')
  })

  it('o fundo padrão "Mello" gera um tom azulado claro', () => {
    const tone = toneForBackground('gradient', 'mello')
    expect(tone).toBe(agingTone('#739ffc'))
    const b = parseInt(tone.slice(5, 7), 16)
    const r = parseInt(tone.slice(1, 3), 16)
    expect(b).toBeGreaterThan(r)
  })

  it('todo gradiente e toda cor do protótipo geram um tom', () => {
    for (const gradient of BOARD_GRADIENTS) {
      expect(toneForBackground('gradient', gradient.id)).toMatch(/^#[0-9a-f]{6}$/)
    }
    expect(toneForBackground('color', '#216e4e')).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('fundo em CSS', () => {
  it('gradiente vira o CSS do protótipo; cor vira a própria cor', () => {
    expect(backgroundCss('gradient', 'mello')).toBe(
      'linear-gradient(135deg,#1f5eff,#4d8dff 60%,#eef1f6)'
    )
    expect(backgroundCss('color', '#a54800')).toBe('#a54800')
  })

  it('um gradiente desconhecido cai no "Mello"', () => {
    expect(backgroundCss('gradient', 'nao-existe')).toBe(BOARD_GRADIENTS[0]!.css)
  })
})
