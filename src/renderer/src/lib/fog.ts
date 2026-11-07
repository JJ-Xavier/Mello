// O visual do envelhecimento (ENV-09): a função fog(level, seed, claro) do protótipo
// (Quadro.dc.html), com o algoritmo e as constantes dela. O card fica com o cinza do nível e as
// bordas "comidas" por manchas redondas, deixando ver o tom de baixo. As diferenças:
// - recebe o tamanho real do card (o protótipo fixava 252 × 100 px);
// - num card com menos de 100 px de altura, as manchas e a distância da borda encolhem na
//   proporção da altura (decidido em 26/10/2026): com as medidas do protótipo, as manchas de uma
//   borda cobririam as da outra, e o card de uma linha quase não mostraria o desgaste. De 100 px
//   para cima, o desenho é exatamente o do protótipo;
// - as cores vêm do tema: o cinza de cada nível é --fog1 a --fog5 (valores do protótipo, um por
//   tema, em themes.css) e o tom de baixo é --aging-tone, que o quadro define pelo fundo dele
//   (FUN-09) no lugar do bege #d8bd9b. Assim o desenho não muda com o tema nem com o fundo.
// A semente é o id do card: o mesmo card tem sempre o mesmo desenho em cada nível.

const f = (n: number) => n.toFixed(1)

// Altura dos cards do protótipo e o menor encolhimento (um card de uma linha tem uns 38 px).
const PROTOTYPE_HEIGHT = 100
const MIN_SCALE = 0.3

// O fundo (CSS background) do card no nível 1 a 5, ou null no nível 0 (o card normal).
export function fog(level: number, seed: string, width: number, height: number): string | null {
  if (!level) return null
  let s = 0
  for (const ch of seed + level) s = (s * 31 + ch.charCodeAt(0)) >>> 0
  const random = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  const scale = Math.min(1, Math.max(MIN_SCALE, height / PROTOTYPE_HEIGHT))
  const k = level / 5
  const g = `var(--fog${level})`
  const rb = (19 + 5 * k) * scale
  const gap = 6 * k * k * scale
  const layers: string[] = []
  const blob = (x: string, y: string, r: number) =>
    `radial-gradient(circle ${f(r)}px at ${x} ${y}, ${g} ${f(r - 4.5 * scale)}px, transparent ${f(r + 2 * scale)}px)`
  // Manchas ao longo de uma borda de comprimento `length`; `place` dá o ponto de cada uma.
  const edge = (length: number, place: (p: number, offset: number) => [string, string]) => {
    let p = -rb * 0.2
    while (p < length + rb * 0.2) {
      const r = rb * (0.75 + random() * 0.5)
      const offset = gap + r * (0.5 + 0.5 * k) * (0.9 + random() * 0.25)
      layers.push(blob(...place(p, offset), r))
      layers.push(blob(...place(p + r * 0.7, offset + r * 0.8), r * 1.1))
      p += r * (1.2 + 0.3 * k + random() * 0.35)
    }
  }
  edge(width, (p, o) => [`${f(p)}px`, `${f(o)}px`])
  edge(width, (p, o) => [`${f(p)}px`, `calc(100% - ${f(o)}px)`])
  edge(height, (p, o) => [`${f(o)}px`, `${f(p)}px`])
  edge(height, (p, o) => [`calc(100% - ${f(o)}px)`, `${f(p)}px`])
  const inset = (2 * (gap + rb * 1.6)).toFixed(0)
  layers.push(
    `linear-gradient(${g},${g}) center/calc(100% - ${inset}px) calc(100% - ${inset}px) no-repeat`
  )
  return `${layers.join(', ')}, var(--aging-tone)`
}
