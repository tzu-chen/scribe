import styles from './TagFilter.module.css';

interface TagFilterProps {
  tags: string[];
  selectedTags: string[];
  onToggle: (tag: string) => void;
}

export function TagFilter({ tags, selectedTags, onToggle }: TagFilterProps) {
  if (tags.length === 0) return null;

  return (
    <div className={styles.container}>
      {tags.map(tag => (
        <button
          key={tag}
          className={`${styles.tag} ${selectedTags.includes(tag) ? styles.active : ''}`}
          onClick={() => onToggle(tag)}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}
