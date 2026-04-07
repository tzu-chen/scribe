import { useCallback } from 'react';
import MDEditor from '@uiw/react-md-editor';
import { renderKatexToString } from '../../utils/katex';
import { useTheme } from '../../contexts/ThemeContext';
import styles from './NoteEditor.module.css';

interface NoteEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: number;
}

// Process LaTeX in the preview by intercepting code rendering
const previewOptions = {
  components: {
    code: ({ children, className, ...props }: React.ComponentProps<'code'> & { 'data-code'?: string }) => {
      const codeString = props['data-code'] || (typeof children === 'string' ? children : '');

      // Block KaTeX: ```katex ... ```
      if (typeof className === 'string' && /^language-katex/i.test(className)) {
        const html = renderKatexToString(codeString, true);
        return <code dangerouslySetInnerHTML={{ __html: html }} style={{ whiteSpace: 'normal' }} />;
      }

      // Inline KaTeX: `$$...$$`
      const text = typeof children === 'string' ? children : '';
      if (/^\$\$([\s\S]+)\$\$$/m.test(text)) {
        const expression = text.slice(2, -2);
        const html = renderKatexToString(expression, false);
        return <code dangerouslySetInnerHTML={{ __html: html }} style={{ background: 'none', padding: 0 }} />;
      }

      return <code className={className}>{children}</code>;
    },
  },
};

export function NoteEditor({ value, onChange, height = 500 }: NoteEditorProps) {
  const { scheme } = useTheme();
  const handleChange = useCallback(
    (val?: string) => {
      onChange(val || '');
    },
    [onChange],
  );

  return (
    <div className={styles.editor} data-color-mode={scheme.type === 'dark' ? 'dark' : 'light'}>
      <MDEditor
        value={value}
        onChange={handleChange}
        height={height}
        preview="live"
        previewOptions={previewOptions}
      />
    </div>
  );
}
