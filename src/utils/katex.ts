import katex from 'katex';
import 'katex/dist/katex.min.css';

export function renderKatexToString(expression: string, displayMode: boolean): string {
  try {
    return katex.renderToString(expression, {
      throwOnError: false,
      displayMode,
    });
  } catch {
    return expression;
  }
}

/**
 * Process inline $...$ math in plain text, returning HTML string.
 * Also converts markdown italic *...* to <em>...</em>.
 */
export function processInlineKatex(text: string): string {
  // First pass: replace $...$ with KaTeX HTML
  let result = text.replace(/\$([^$]+)\$/g, (_match, expr: string) => {
    return renderKatexToString(expr, false);
  });

  // Second pass: convert *...* to <em>...</em>
  result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  return result;
}
