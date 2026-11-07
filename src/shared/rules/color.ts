// Cores das etiquetas (ETQ) e o texto legível sobre elas.

// A paleta das etiquetas e da capa (NovoCardCapaAnexos.dc.html). As 6 primeiras do quadro novo
// (ETQ-02) estão aqui, mais azul-petróleo e azul.
export const LABEL_COLORS = [
  { name: 'roxo', value: '#6e5dc6' },
  { name: 'vermelho', value: '#c9372c' },
  { name: 'laranja', value: '#b65c02' },
  { name: 'amarelo', value: '#e2b203' },
  { name: 'verde', value: '#216e4e' },
  { name: 'azul-petróleo', value: '#206a83' },
  { name: 'azul', value: '#1f5eff' },
  { name: 'cinza', value: '#8c9bab' }
] as const

export function colorName(hex: string): string {
  return LABEL_COLORS.find((c) => c.value === hex.toLowerCase())?.name ?? hex
}

const DARK_TEXT = '#1d2125'
const LIGHT_TEXT = '#ffffff'

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

// O texto (escuro ou branco) com mais contraste sobre a cor. Dá o mesmo que o protótipo: escuro
// no amarelo e no cinza, branco nas outras.
export function textOn(hex: string): string {
  return contrast(hex, DARK_TEXT) > contrast(hex, LIGHT_TEXT) ? DARK_TEXT : LIGHT_TEXT
}
