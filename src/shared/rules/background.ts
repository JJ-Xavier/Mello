// Fundos de quadro do protótipo (Fundo.dc.html, FUN-01). O editor de fundo entra na etapa 9; aqui
// ficam as cores, os gradientes e como cada fundo vira CSS.

export type BackgroundKind = 'image' | 'color' | 'gradient'

export interface BoardColor {
  name: string
  hex: string
}

export interface BoardGradient {
  id: string
  name: string
  css: string
  stops: string[]
}

export const BOARD_COLORS: BoardColor[] = [
  { name: 'Azul Mello', hex: '#1f5eff' },
  { name: 'Grafite', hex: '#2c333a' },
  { name: 'Verde', hex: '#216e4e' },
  { name: 'Roxo', hex: '#5e4db2' },
  { name: 'Laranja', hex: '#a54800' },
  { name: 'Vermelho', hex: '#ae2e24' },
  { name: 'Azul-petróleo', hex: '#206a83' },
  { name: 'Cinza claro', hex: '#8590a2' }
]

export const BOARD_GRADIENTS: BoardGradient[] = [
  {
    id: 'mello',
    name: 'Mello',
    css: 'linear-gradient(135deg,#1f5eff,#4d8dff 60%,#eef1f6)',
    stops: ['#1f5eff', '#4d8dff', '#eef1f6']
  },
  {
    id: 'por-do-sol',
    name: 'Pôr do sol',
    css: 'linear-gradient(160deg,#f7d6b5,#a9abb8 60%,#33374b)',
    stops: ['#f7d6b5', '#a9abb8', '#33374b']
  },
  {
    id: 'oceano',
    name: 'Oceano',
    css: 'linear-gradient(135deg,#0c66e4,#09326c)',
    stops: ['#0c66e4', '#09326c']
  },
  {
    id: 'floresta',
    name: 'Floresta',
    css: 'linear-gradient(135deg,#216e4e,#164b35)',
    stops: ['#216e4e', '#164b35']
  },
  {
    id: 'uva',
    name: 'Uva',
    css: 'linear-gradient(135deg,#5e4db2,#352c63)',
    stops: ['#5e4db2', '#352c63']
  },
  {
    id: 'noite',
    name: 'Noite',
    css: 'linear-gradient(135deg,#2c333a,#101204)',
    stops: ['#2c333a', '#101204']
  }
]

// Quadro novo nasce com o gradiente "Mello" (QUA-03).
export const DEFAULT_BACKGROUND = { kind: 'gradient', value: 'mello' } as const

// Cor usada enquanto não há imagem para mostrar (as imagens entram na etapa 9).
const IMAGE_PLACEHOLDER = '#33374b'

export function findGradient(id: string): BoardGradient | undefined {
  return BOARD_GRADIENTS.find((gradient) => gradient.id === id)
}

// O valor de background (CSS) de um fundo de cor ou gradiente.
export function backgroundCss(kind: BackgroundKind, value: string): string {
  if (kind === 'color') return value
  if (kind === 'gradient') return findGradient(value)?.css ?? BOARD_GRADIENTS[0]!.css
  return IMAGE_PLACEHOLDER
}
