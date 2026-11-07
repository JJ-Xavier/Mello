// Remove acentos e cedilha ("Ação" → "Acao"). Usado pela função unaccent do SQLite (busca, BUS-01)
// e, mais adiante, pelo filtro do quadro (FLT).
export function removeAccents(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '')
}
