// Tom do envelhecimento (FUN-09): a cor que aparece por baixo das bordas "comidas" do card. Vem da
// cor média do fundo, com a saturação limitada a 45% e a luminosidade fixada em 73%. O bege
// #d8bd9b do protótipo é exatamente uma cor assim (saturação 44%, luminosidade 73%).
import { findGradient, type BackgroundKind } from './background'

interface Rgb {
  r: number
  g: number
  b: number
}

function parseHex(hex: string): Rgb {
  const value = hex.replace('#', '')
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  }
}

function toHex({ r, g, b }: Rgb): string {
  const part = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

export function averageColor(hexes: string[]): string {
  const colors = hexes.map(parseHex)
  const mean = (key: keyof Rgb) => colors.reduce((sum, c) => sum + c[key], 0) / colors.length
  return toHex({ r: mean('r'), g: mean('g'), b: mean('b') })
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0)
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  return { h: h * 60, s, l }
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

export const TONE_MAX_SATURATION = 0.45
export const TONE_LIGHTNESS = 0.73

// Converte a cor média de um fundo no tom do envelhecimento.
export function agingTone(averageHex: string): string {
  const { h, s } = rgbToHsl(parseHex(averageHex))
  return toHex(hslToRgb(h, Math.min(s, TONE_MAX_SATURATION), TONE_LIGHTNESS))
}

// Tom de um fundo de cor ou gradiente. Para imagem, a cor média vem da análise feita no envio
// (etapa 9) e é passada direto para agingTone.
export function toneForBackground(kind: BackgroundKind, value: string): string {
  if (kind === 'color') return agingTone(value)
  if (kind === 'gradient') {
    const gradient = findGradient(value)
    if (gradient) return agingTone(averageColor(gradient.stops))
  }
  return agingTone('#33374b')
}
