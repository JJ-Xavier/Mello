// Ajuste automático do fundo de imagem (FUN-04) e o indicador de legibilidade (FUN-06). Funções
// puras sobre os pixels de uma cópia reduzida da imagem (64 × 40, RGB, linha por linha), que a
// tela tira com um canvas no envio.

export const SAMPLE_WIDTH = 64
export const SAMPLE_HEIGHT = 40

// FUN-04 e FUN-06: o contraste mínimo do texto branco sobre o fundo escurecido (WCAG AA).
export const MIN_CONTRAST = 4.5
export const MAX_DIM = 70
export const MAX_BLUR = 20
export const BUSY_BLUR = 6
// Detalhe médio acima do qual a imagem é "carregada" e ganha desfoque: a diferença de brilho
// (0 a 255) entre um pixel e os vizinhos da direita e de baixo, somadas, na média da imagem.
// Calibrado em 28/10/2026 com os papéis de parede do Windows: os lisos ficam entre 6 e 12, as
// fotos de paisagem entre 14 e 20 e o mais carregado (formas coloridas em fundo escuro), em 31.
export const BUSY_DETAIL = 24

export interface BackgroundAuto {
  focus: number
  zoom: number
  dim: number
  blur: number
}

export interface BackgroundAnalysis {
  auto: BackgroundAuto
  // A cor média, de onde vem o tom do envelhecimento (FUN-09).
  avgColor: string
  // Os pixels da cópia reduzida, para o indicador de legibilidade com outros ajustes.
  rgb: number[]
}

const pad = (n: number) => Math.round(n).toString(16).padStart(2, '0')

function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

// FUN-06: o contraste estimado do texto branco sobre o fundo com o escurecer e o desfoque dados.
// A camada preta de "Escurecer" multiplica cada pixel por (1 − escurecer). O fundo vale a
// luminância média mais um desvio padrão: as partes claras de uma imagem com muito contraste
// pesam mais que a média. O desfoque mistura as partes claras com as escuras, então tira esse
// desvio aos poucos, até sumir em 20 px.
export function estimatedContrast(rgb: ArrayLike<number>, dim: number, blur: number): number {
  const keep = 1 - dim / 100
  const count = rgb.length / 3
  let sum = 0
  let squares = 0
  for (let i = 0; i < rgb.length; i += 3) {
    const y = luminance(rgb[i]! * keep, rgb[i + 1]! * keep, rgb[i + 2]! * keep)
    sum += y
    squares += y * y
  }
  const mean = sum / count
  const spread = Math.sqrt(Math.max(0, squares / count - mean * mean))
  const background = mean + spread * Math.max(0, 1 - blur / MAX_BLUR)
  return 1.05 / (background + 0.05)
}

export function isLegible(rgb: ArrayLike<number>, dim: number, blur: number): boolean {
  return estimatedContrast(rgb, dim, blur) >= MIN_CONTRAST
}

// Uma célula só tira o foco do centro com pelo menos 10% mais detalhe que ele: com o detalhe
// espalhado por igual (diferenças pequenas, de arredondamento), é empate, e o foco fica no centro.
const TIE_MARGIN = 1.1

// FUN-04: foco na célula da grade 3 × 3 com mais detalhe (empate: o centro); zoom de 112% com o
// foco fora do centro; desfoque de 6 px na imagem carregada; e o menor escurecer, de 2 em 2%, até
// 70%, que deixa o texto branco legível.
export function analyzeBackground(
  rgb: ArrayLike<number>,
  width = SAMPLE_WIDTH,
  height = SAMPLE_HEIGHT
): BackgroundAnalysis {
  const gray = new Float64Array(width * height)
  const total = [0, 0, 0]
  for (let i = 0; i < width * height; i++) {
    const [r, g, b] = [rgb[i * 3]!, rgb[i * 3 + 1]!, rgb[i * 3 + 2]!]
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b
    total[0]! += r
    total[1]! += g
    total[2]! += b
  }

  // Só os pixels com vizinho à direita e embaixo contam (a última coluna e a última linha não). As
  // células não têm todas o mesmo tamanho (64 e 40 não dividem por 3): vale a média de cada uma.
  const cells = Array<number>(9).fill(0)
  const sizes = Array<number>(9).fill(0)
  let detail = 0
  for (let y = 0; y + 1 < height; y++) {
    for (let x = 0; x + 1 < width; x++) {
      const here = gray[y * width + x]!
      const edges =
        Math.abs(gray[y * width + x + 1]! - here) + Math.abs(gray[(y + 1) * width + x]! - here)
      const cell = Math.floor((y * 3) / height) * 3 + Math.floor((x * 3) / width)
      cells[cell]! += edges
      sizes[cell]!++
      detail += edges
    }
  }
  detail /= (width - 1) * (height - 1)

  const energy = cells.map((sum, i) => (sizes[i] ? sum / sizes[i]! : 0))
  const best = energy.reduce((top, value, i) => (value > energy[top]! ? i : top), 4)
  const focus = energy[best]! > energy[4]! * TIE_MARGIN ? best : 4
  const blur = detail > BUSY_DETAIL ? BUSY_BLUR : 0
  let dim = 0
  while (dim < MAX_DIM && !isLegible(rgb, dim, blur)) dim += 2

  const count = width * height
  return {
    auto: { focus, zoom: focus === 4 ? 100 : 112, dim, blur },
    avgColor: `#${pad(total[0]! / count)}${pad(total[1]! / count)}${pad(total[2]! / count)}`,
    rgb: Array.from(rgb)
  }
}
