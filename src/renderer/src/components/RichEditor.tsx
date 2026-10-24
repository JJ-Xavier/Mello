// Editor de texto rico da descrição (NOT-07) e da nota (NOT-01). A barra tem as ferramentas do
// protótipo (NOT-02): Título, Negrito, Itálico, Lista, Caixa de marcar e Link.
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { safeHref } from '../../../shared/rules/richText'
import { cx } from '../lib/cx'
import { Icon } from './Icon'
import { Popover, PopoverHeader } from './Popover'
import styles from './RichEditor.module.css'
import { richExtensions } from './richExtensions'
import ui from './ui.module.css'

// Só leitura: mostra o HTML guardado pelo esquema do editor (nada de innerHTML).
export function RichContent({ html, className }: { html: string; className?: string }) {
  const editor = useEditor({
    extensions: richExtensions({ editable: false }),
    content: html,
    editable: false,
    immediatelyRender: true
  })
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.commands.setContent(html, { emitUpdate: false })
  }, [editor, html])
  return <EditorContent editor={editor} className={cx(styles.rich, className)} />
}

function LinkForm({ editor, close }: { editor: Editor; close: () => void }) {
  const [href, setHref] = useState(() => String(editor.getAttributes('link')['href'] ?? ''))
  const valid = safeHref(href) !== null

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!valid) return
    editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run()
    close()
  }

  const remove = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    close()
  }

  return (
    <form className={styles.linkForm} onSubmit={save}>
      <PopoverHeader title="Link" onClose={close} />
      <label className={ui.label}>
        Endereço
        <input
          className={ui.fld}
          value={href}
          placeholder="https://"
          autoFocus
          onChange={(event) => setHref(event.target.value)}
        />
      </label>
      <p className={ui.note}>Começa com https://, http:// ou mailto:.</p>
      <div className={styles.linkActions}>
        <button type="submit" className={ui.pri} disabled={!valid}>
          Salvar
        </button>
        {editor.isActive('link') && (
          <button type="button" className={ui.sec} onClick={remove}>
            Remover link
          </button>
        )}
      </div>
    </form>
  )
}

function Tool({
  label,
  active,
  onClick,
  children,
  popoverTarget
}: {
  label: string
  active?: boolean
  onClick?: () => void
  children: ReactNode
  popoverTarget?: string
}) {
  return (
    <button
      type="button"
      className={cx(styles.tool, active && styles.toolActive)}
      aria-label={label}
      aria-pressed={popoverTarget ? undefined : (active ?? false)}
      title={label}
      onClick={onClick}
      popoverTarget={popoverTarget}
      // Não tira o foco (e a seleção) do texto.
      onMouseDown={(event) => event.preventDefault()}
    >
      {children}
    </button>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const linkId = useId()
  // Os botões só acendem com o editor em uso: a nota fica sempre aberta, e o cursor parado no
  // começo (num título, por exemplo) não deve deixar a barra acesa.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const on = (name: string, attrs?: Record<string, unknown>) =>
        e.isFocused && e.isActive(name, attrs)
      return {
        heading: on('heading', { level: 3 }),
        bold: on('bold'),
        italic: on('italic'),
        bulletList: on('bulletList'),
        taskList: on('taskList'),
        link: on('link')
      }
    }
  })
  const chain = () => editor.chain().focus()
  return (
    <div role="toolbar" aria-label="Formatação" className={styles.toolbar}>
      <Tool
        label="Título"
        active={state.heading}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      >
        H
      </Tool>
      <Tool label="Negrito" active={state.bold} onClick={() => chain().toggleBold().run()}>
        B
      </Tool>
      <Tool label="Itálico" active={state.italic} onClick={() => chain().toggleItalic().run()}>
        <span style={{ fontStyle: 'italic' }}>I</span>
      </Tool>
      <Tool
        label="Lista"
        active={state.bulletList}
        onClick={() => chain().toggleBulletList().run()}
      >
        <Icon name="bulletList" />
      </Tool>
      <Tool
        label="Caixa de marcar"
        active={state.taskList}
        onClick={() => chain().toggleTaskList().run()}
      >
        <Icon name="checklist" />
      </Tool>
      <Tool label="Link" active={state.link} popoverTarget={linkId}>
        <Icon name="link" />
      </Tool>
      <Popover id={linkId} label="Link">
        {(close) => <LinkForm editor={editor} close={close} />}
      </Popover>
    </div>
  )
}

// Edição: a barra e o texto. onReady entrega o editor a quem vai salvar (getJSON()); onChange
// avisa cada mudança do texto (a nota salva sozinha). O conteúdo vem de `html` só ao montar: uma
// atualização do card enquanto você digita não mexe no que está no editor.
// variant "note": a nota, sempre aberta na coluna da direita (Card.dc.html), sem caixa em volta e
// com o texto rolando abaixo da barra.
// onEscape: o que o Esc faz. O ProseMirror segura o Esc dentro do editor (o <dialog> do modal não
// fecha); sem onEscape, a tecla segue para quem estiver em volta (a descrição sai da edição).
export function RichEditor({
  html,
  label,
  limit,
  placeholder,
  autofocus = true,
  variant = 'box',
  onReady,
  onChange,
  onEscape
}: {
  html: string
  label: string
  limit: number
  placeholder?: string
  autofocus?: boolean
  variant?: 'box' | 'note'
  onReady?: (editor: Editor) => void
  onChange?: (editor: Editor) => void
  onEscape?: () => void
}) {
  const escape = useRef(onEscape)
  useEffect(() => {
    escape.current = onEscape
  }, [onEscape])
  const editor = useEditor({
    extensions: richExtensions({ editable: true, placeholder, limit }),
    content: html,
    autofocus: autofocus ? 'end' : false,
    immediatelyRender: true,
    onUpdate: ({ editor: changed }) => onChange?.(changed),
    editorProps: {
      attributes: { 'aria-label': label, 'aria-multiline': 'true', role: 'textbox' },
      handleKeyDown: (_view, event) => {
        if (event.key !== 'Escape' || !escape.current) return false
        escape.current()
        return true
      },
      // Editando, Ctrl+clique abre o link (no programa padrão, pelo main; NOT-05).
      handleClick: (_view, _pos, event) => {
        if (!event.ctrlKey && !event.metaKey) return false
        const href = (event.target as Element).closest('a[href]')?.getAttribute('href')
        if (!href || !safeHref(href)) return false
        window.open(href, '_blank', 'noopener')
        return true
      }
    }
  })
  useEffect(() => {
    if (editor) onReady?.(editor)
  }, [editor, onReady])
  if (!editor) return null
  return (
    <div className={cx(styles.editor, variant === 'note' && styles.noteEditor)}>
      <Toolbar editor={editor} />
      <EditorContent
        editor={editor}
        className={cx(styles.rich, variant === 'note' ? styles.noteText : styles.editable)}
      />
    </div>
  )
}
