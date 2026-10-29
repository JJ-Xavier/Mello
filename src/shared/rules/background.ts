// Fundos de quadro do protótipo (Fundo.dc.html, FUN-01): as cores, os gradientes, a imagem com os
// ajustes (FUN-03) e como cada fundo vira CSS nas miniaturas. O ajuste automático da imagem fica em
// backgroundAuto.ts.

export type BackgroundKind = 'image' | 'color' | 'gradient'

export interface BoardBackground {
  kind: BackgroundKind
  // A cor (hex), o id do gradiente ou o id do arquivo da imagem.
  value: string
  // Imagem: o endereço (mello-arquivo://) e o tamanho; null nas outras.
  url: string | null
  width: number | null
  height: number | null
  // FUN-03 a FUN-05: os ajustes da imagem. Cor e gradiente ficam nos valores padrão.
  auto: boolean
  focus: number
  zoom: number
  dim: number
  blur: number
}

// FUN-02: os formatos e o tamanho da imagem de fundo.
export const BACKGROUND_IMAGE_EXTENSIONS = ['jpg', 'png', 'webp']
export const BACKGROUND_IMAGE_MAX_BYTES = 25 * 1024 * 1024

// Os ajustes de um fundo sem imagem e os limites dos controles do editor.
export const BACKGROUND_DEFAULTS = { auto: true, focus: 4, zoom: 100, dim: 0, blur: 0 }
export const ZOOM_RANGE = { min: 100, max: 200 }
export const DIM_RANGE = { min: 0, max: 70 }
export const BLUR_RANGE = { min: 0, max: 20 }

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

// Cor por baixo da imagem enquanto ela carrega (a do protótipo).
export const IMAGE_PLACEHOLDER = '#33374b'

export function findGradient(id: string): BoardGradient | undefined {
  return BOARD_GRADIENTS.find((gradient) => gradient.id === id)
}

// FUN-03: o ponto de foco é uma célula da grade 3 × 3 (0 a 8, linha por linha). A imagem fica
// alinhada por ele: a coluna da esquerda encosta a imagem na esquerda, e assim por diante.
export function focusPosition(focus: number): { x: string; y: string } {
  const at = ['0%', '50%', '100%'] as const
  return { x: at[focus % 3]!, y: at[Math.floor(focus / 3)]! }
}

// O fundo como valor de background do CSS, para as miniaturas (Início, "Mudar de quadros"): a
// imagem com o foco e o escurecer; o zoom e o desfoque não aparecem nesse tamanho.
export function backgroundCss(
  background: Pick<BoardBackground, 'kind' | 'value' | 'url' | 'focus' | 'dim'>
): string {
  if (background.kind === 'color') return background.value
  if (background.kind === 'gradient') {
    return findGradient(background.value)?.css ?? BOARD_GRADIENTS[0]!.css
  }
  if (!background.url) return IMAGE_PLACEHOLDER
  const { x, y } = focusPosition(background.focus)
  const shade = `rgba(0, 0, 0, ${background.dim / 100})`
  return `linear-gradient(${shade}, ${shade}), url("${background.url}") ${x} ${y} / cover no-repeat ${IMAGE_PLACEHOLDER}`
}

// A proporção nominal da tela do quadro, para mostrar o recorte da imagem no editor.
export const SCREEN_RATIO = 16 / 10

// A parte da imagem que aparece numa tela 16:10 (FUN-03), em frações da imagem: a imagem cobre a
// tela alinhada pelo foco, e o zoom aproxima a partir do ponto de foco.
export function visibleArea(
  width: number,
  height: number,
  focus: number,
  zoom: number
): { left: number; top: number; width: number; height: number } {
  const ratio = width / height
  const shownWidth = ratio > SCREEN_RATIO ? SCREEN_RATIO / ratio : 1
  const shownHeight = ratio > SCREEN_RATIO ? 1 : ratio / SCREEN_RATIO
  const scale = zoom / 100
  const px = (focus % 3) / 2
  const py = Math.floor(focus / 3) / 2
  return {
    left: (1 - shownWidth) * px + shownWidth * px * (1 - 1 / scale),
    top: (1 - shownHeight) * py + shownHeight * py * (1 - 1 / scale),
    width: shownWidth / scale,
    height: shownHeight / scale
  }
}
