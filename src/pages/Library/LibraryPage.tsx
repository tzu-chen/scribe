import { useState, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { NoteCard } from '../../components/NoteCard/NoteCard';
import { SearchBar } from '../../components/SearchBar/SearchBar';
import { TagFilter } from '../../components/TagFilter/TagFilter';
import { useNotes } from '../../hooks/useNotes';
import { useTags } from '../../hooks/useTags';
import { useCategories } from '../../hooks/useCategories';
import { useSubjects } from '../../hooks/useSubjects';
import type { NoteStatus } from '../../types/note';
import styles from './LibraryPage.module.css';

type StatusFilter = 'all' | NoteStatus;

export function LibraryPage() {
  const [searchParams] = useSearchParams();
  const { notes } = useNotes();
  const { allTags } = useTags(notes);
  const { allCategories } = useCategories(notes);
  const { allSubjects } = useSubjects(notes);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSubject, setSelectedSubject] = useState(
    () => searchParams.get('subject') || 'all',
  );

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    );
  }, []);

  const filteredNotes = useMemo(() => {
    return notes
      .filter(note => {
        if (statusFilter !== 'all' && note.status !== statusFilter) return false;
        if (selectedCategory !== 'all' && (note.category || '') !== selectedCategory) return false;
        if (selectedSubject !== 'all' && (note.subject || '') !== selectedSubject) return false;
        if (selectedTags.length > 0 && !selectedTags.every(t => note.tags.includes(t))) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          if (!note.title.toLowerCase().includes(q) && !note.content.toLowerCase().includes(q)) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [notes, statusFilter, selectedCategory, selectedSubject, selectedTags, searchQuery]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Library</h1>
        <Link to="/note/new" className={styles.newButton}>
          + New Note
        </Link>
      </div>

      <div className={styles.filters}>
        <SearchBar value={searchQuery} onChange={setSearchQuery} />

        <div className={styles.statusTabs}>
          {(['all', 'draft', 'published'] as const).map(status => (
            <button
              key={status}
              className={`${styles.statusTab} ${statusFilter === status ? styles.activeTab : ''}`}
              onClick={() => setStatusFilter(status)}
            >
              {status === 'all' ? 'All' : status === 'draft' ? 'Drafts' : 'Published'}
            </button>
          ))}
        </div>

        <div className={styles.statusTabs}>
          <button
            className={`${styles.statusTab} ${selectedCategory === 'all' ? styles.activeTab : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            All Categories
          </button>
          {allCategories.map(cat => (
            <button
              key={cat}
              className={`${styles.statusTab} ${selectedCategory === cat ? styles.activeTab : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {allSubjects.length > 0 && (
          <select
            className={styles.subjectFilter}
            value={selectedSubject}
            onChange={e => setSelectedSubject(e.target.value)}
          >
            <option value="all">All Subjects</option>
            {allSubjects.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}

        <TagFilter tags={allTags} selectedTags={selectedTags} onToggle={toggleTag} />
      </div>

      {filteredNotes.length === 0 ? (
        <div className={styles.empty}>
          {notes.length === 0 ? (
            <>
              <p className={styles.emptyTitle}>No notes yet</p>
              <p className={styles.emptyText}>
                Create your first study note to get started.
              </p>
              <Link to="/note/new" className={styles.emptyAction}>
                + Create Note
              </Link>
            </>
          ) : (
            <>
              <p className={styles.emptyTitle}>No matching notes</p>
              <p className={styles.emptyText}>
                Try adjusting your search or filters.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredNotes.map(note => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}
    </div>
  );
}
