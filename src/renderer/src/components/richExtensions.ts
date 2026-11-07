// O esquema do editor da descrição e da nota (NOT-02, NOT-04): título (só h3), parágrafo, negrito,
// itálico, lista, caixa de marcar e link http, https ou mailto. O resto do StarterKit fica
// desligado, então o TipTap descarta essas marcas ao abrir um HTML. O main limpa de novo ao salvar
// (shared/rules/richText.ts).
// limit: o editor para de aceitar texto no tamanho máximo, contado como o main conta (textLength).
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { CharacterCount, Placeholder } from '@tiptap/extensions'
import StarterKit from '@tiptap/starter-kit'
import { safeHref } from '../../../shared/rules/richText'

export function richExtensions({
  editable,
  placeholder,
  limit
}: {
  editable: boolean
  placeholder?: string
  limit?: number
}) {
  return [
    StarterKit.configure({
      heading: { levels: [3] },
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      orderedList: false,
      strike: false,
      underline: false,
      // NOT-05: no modo leitura o clique abre o link (no navegador padrão, pelo main). Editando,
      // o clique posiciona o cursor e Ctrl+clique abre (RichEditor).
      link: {
        openOnClick: !editable,
        autolink: true,
        protocols: ['mailto'],
        defaultProtocol: 'https',
        isAllowedUri: (url) => safeHref(url) !== null
      }
    }),
    TaskList,
    TaskItem.configure({
      nested: true,
      // O rótulo da caixa para o leitor de tela (o padrão do TipTap é em inglês).
      a11y: {
        checkboxLabel: (node, checked) =>
          `${checked ? 'Desmarcar' : 'Marcar'} “${node.textContent || 'tarefa sem texto'}”`
      }
    }),
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
    ...(limit ? [CharacterCount.configure({ limit })] : [])
  ]
}
