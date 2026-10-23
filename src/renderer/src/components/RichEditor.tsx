// Editor de texto rico da descrição (NOT-07) e, na etapa 5, da nota (NOT-01). A barra tem as
// ferramentas do protótipo (NOT-02): Título, Negrito, Itálico, Lista, Caixa de marcar e Link.
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
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
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      heading: e.isActive('heading', { level: 3 }),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      bulletList: e.isActive('bulletList'),
      taskList: e.isActive('taskList'),
      link: e.isActive('link')
    })
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

// Edição: a barra e o texto. onReady entrega o editor a quem vai salvar (getJSON()).
export function RichEditor({
  html,
  label,
  onReady
}: {
  html: string
  label: string
  onReady: (editor: Editor) => void
}) {
  const editor = useEditor({
    extensions: richExtensions({ editable: true }),
    content: html,
    autofocus: 'end',
    immediatelyRender: true,
    editorProps: { attributes: { 'aria-label': label, 'aria-multiline': 'true', role: 'textbox' } }
  })
  useEffect(() => {
    if (editor) onReady(editor)
  }, [editor, onReady])
  if (!editor) return null
  return (
    <div className={styles.editor}>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className={cx(styles.rich, styles.editable)} />
    </div>
  )
}
