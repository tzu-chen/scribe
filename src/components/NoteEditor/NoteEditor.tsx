import { useCallback } from 'react';
import MDEditor from '@uiw/react-md-editor';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import styles from './NoteEditor.module.css';

interface NoteEditorProps {
  value: string;
  onChange: (value: string) => void;
}

function renderKatex(expression: string, displayMode: boolean): string {
  try {
    return katex.renderToString(expression, {
      throwOnError: false,
      displayMode,
    });
  } catch {
    return expression;
  }
}

// Process LaTeX in the preview by intercepting code rendering
const previewOptions = {
  components: {
    code: ({ children, className, ...props }: React.ComponentProps<'code'> & { 'data-code'?: string }) => {
      const codeString = props['data-code'] || (typeof children === 'string' ? children : '');

      // Block KaTeX: ```katex ... ```
      if (typeof className === 'string' && /^language-katex/i.test(className)) {
        const html = renderKatex(codeString, true);
        return <code dangerouslySetInnerHTML={{ __html: html }} style={{ whiteSpace: 'normal' }} />;
      }

      // Inline KaTeX: `$$...$$`
      const text = typeof children === 'string' ? children : '';
      if (/^\$\$([\s\S]+)\$\$$/m.test(text)) {
        const expression = text.slice(2, -2);
        const html = renderKatex(expression, false);
        return <code dangerouslySetInnerHTML={{ __html: html }} style={{ background: 'none', padding: 0 }} />;
      }

      return <code className={className}>{children}</code>;
    },
  },
};

export function NoteEditor({ value, onChange }: NoteEditorProps) {
  const handleChange = useCallback(
    (val?: string) => {
      onChange(val || '');
    },
    [onChange],
  );

  return (
    <div className={styles.editor} data-color-mode="light">
      <MDEditor
        value={value}
        onChange={handleChange}
        height={500}
        preview="live"
        previewOptions={previewOptions}
      />
    </div>
  );
}
