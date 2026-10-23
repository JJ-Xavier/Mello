// O esquema do editor da descrição e da nota (NOT-02, NOT-04): título (só h3), parágrafo, negrito,
// itálico, lista, caixa de marcar e link http, https ou mailto. O resto do StarterKit fica
// desligado, então o TipTap descarta essas marcas ao abrir um HTML. O main limpa de novo ao salvar
// (shared/rules/richText.ts).
import { TaskItem, TaskList } from '@tiptap/extension-list'
import StarterKit from '@tiptap/starter-kit'
import { safeHref } from '../../../shared/rules/richText'

export function richExtensions({ editable }: { editable: boolean }) {
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
      // NOT-05: no modo leitura o clique abre o link (no navegador padrão, pelo main).
      link: {
        openOnClick: !editable,
        autolink: true,
        protocols: ['mailto'],
        defaultProtocol: 'https',
        isAllowedUri: (url) => safeHref(url) !== null
      }
    }),
    TaskList,
    TaskItem.configure({ nested: true })
  ]
}
