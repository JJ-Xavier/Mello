// Junta nomes de classe, ignorando os vazios: cx(styles.item, ativo && styles.active).
export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ')
}
