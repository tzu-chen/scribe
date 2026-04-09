import { useCallback } from 'react';
import MDEditor from '@uiw/react-md-editor';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { useTheme } from '../../contexts/ThemeContext';
import styles from './NoteEditor.module.css';

interface NoteEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: number;
}

const previewOptions = {
  remarkPlugins: [remarkMath],
  rehypePlugins: [rehypeKatex],
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
