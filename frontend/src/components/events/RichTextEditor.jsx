import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Bold, Italic, List, ListOrdered, Link2 } from 'lucide-react'

function ToolbarButton({ onClick, active, disabled, children, title }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm transition ${
        active ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
      }`}
    >
      {children}
    </button>
  )
}

export default function RichTextEditor({ value, onChange, maxLength = 10000 }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
    ],
    content: value || '',
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'min-h-[200px] rounded-md border px-3 py-2 focus:outline-none',
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    if (value === undefined || value === null) return
    if (editor.getHTML() === value) return
    editor.commands.setContent(value, { emitUpdate: false })
  }, [editor, value])

  const plainTextLength = editor?.getText().length || 0

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
        <ToolbarButton
          title="Bold"
          disabled={!editor}
          active={editor?.isActive('bold')}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          disabled={!editor}
          active={editor?.isActive('italic')}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Bullet List"
          disabled={!editor}
          active={editor?.isActive('bulletList')}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Ordered List"
          disabled={!editor}
          active={editor?.isActive('orderedList')}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Add Link"
          disabled={!editor}
          active={editor?.isActive('link')}
          onClick={() => {
            const previousUrl = editor?.getAttributes('link').href || ''
            const url = window.prompt('Enter URL', previousUrl)

            if (url === null) return
            if (url === '') {
              editor?.chain().focus().unsetLink().run()
              return
            }

            editor?.chain().focus().setLink({ href: url }).run()
          }}
        >
          <Link2 className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <EditorContent editor={editor} />

      <p className={`text-xs ${plainTextLength > maxLength ? 'text-destructive' : 'text-muted-foreground'}`}>
        {plainTextLength}/{maxLength} characters
      </p>
    </div>
  )
}
