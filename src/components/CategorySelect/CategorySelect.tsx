import { useState, useRef } from 'react';
import styles from './CategorySelect.module.css';

interface CategorySelectProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
}

export function CategorySelect({
  value,
  onChange,
  suggestions,
  placeholder = 'Category...',
}: CategorySelectProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = suggestions.filter(s =>
    s.toLowerCase().includes(value.toLowerCase()),
  );

  return (
    <div className={styles.container}>
      <input
        ref={inputRef}
        type="text"
        className={styles.input}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder={placeholder}
      />
      {showSuggestions && filtered.length > 0 && (
        <div className={styles.suggestions}>
          {filtered.map(suggestion => (
            <button
              key={suggestion}
              className={styles.suggestion}
              onMouseDown={e => {
                e.preventDefault();
                onChange(suggestion);
                setShowSuggestions(false);
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
