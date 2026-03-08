import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi.js';
import api from '../../api/client.js';
import styles from './Library.module.css';

export default function Library() {
    const navigate = useNavigate();
    const { data, loading, error, refetch } = useApi('/api/library');
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState('recent');
    const [deleting, setDeleting] = useState(null);

    const files = data?.files || data || [];

    const filtered = useMemo(() => {
        let list = Array.isArray(files) ? [...files] : [];

        // Filter by search
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(f =>
                (f.filename || '').toLowerCase().includes(q) ||
                (f.summary || '').toLowerCase().includes(q) ||
                (f.categories || []).some(c => c.toLowerCase().includes(q))
            );
        }

        // Sort
        list.sort((a, b) => {
            switch (sortBy) {
                case 'name':
                    return (a.filename || '').localeCompare(b.filename || '');
                case 'questions':
                    return (b.questions?.length || 0) - (a.questions?.length || 0);
                case 'recent':
                default:
                    return new Date(b.uploadDate || b.uploadedAt || 0) - new Date(a.uploadDate || a.uploadedAt || 0);
            }
        });

        return list;
    }, [files, search, sortBy]);

    const handleDelete = async (id, name) => {
        if (!confirm(`Delete "${name}"?`)) return;
        setDeleting(id);
        try {
            await api.delete(`/api/library/${id}`);
            refetch();
        } catch (err) {
            alert(err.message || 'Delete failed');
        } finally {
            setDeleting(null);
        }
    };

    const handleStartQuiz = (fileId) => {
        navigate(`/quiz/${fileId}`);
    };

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>
                    <span className={styles.spinner}>📚</span>
                    <p>Loading library...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Library</h1>

            {/* Search & Sort */}
            <div className={styles.controls}>
                <input
                    type="text"
                    placeholder="Search materials..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className={styles.searchInput}
                />
                <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className={styles.sortSelect}
                >
                    <option value="recent">Recent</option>
                    <option value="name">Name</option>
                    <option value="questions">Questions</option>
                </select>
            </div>

            {/* Material Count */}
            <p className={styles.count}>
                {filtered.length} material{filtered.length !== 1 ? 's' : ''}
                {search && ` matching "${search}"`}
            </p>

            {/* Material List */}
            {filtered.length === 0 ? (
                <div className={styles.empty}>
                    <span style={{ fontSize: '3rem' }}>📭</span>
                    <p>{search ? 'No materials match your search.' : 'Your library is empty.'}</p>
                    {!search && (
                        <button
                            className={styles.uploadBtn}
                            onClick={() => navigate('/upload')}
                        >
                            Upload Something
                        </button>
                    )}
                </div>
            ) : (
                <div className={styles.list}>
                    {filtered.map((file) => (
                        <div key={file.id || file._id} className={styles.card}>
                            <div className={styles.cardHeader} onClick={() => handleStartQuiz(file.id || file._id)}>
                                <span className={styles.emoji}>
                                    {file.subjectEmoji || (file.type === 'youtube' ? '🎬' : '📄')}
                                </span>
                                <div className={styles.cardInfo}>
                                    <h3 className={styles.cardTitle}>{file.filename || 'Untitled'}</h3>
                                    <p className={styles.cardMeta}>
                                        {file.questions?.length || 0} questions
                                        {file.type && ` · ${file.type}`}
                                    </p>
                                </div>
                            </div>

                            {/* Categories */}
                            {file.categories?.length > 0 && (
                                <div className={styles.tags}>
                                    {file.categories.slice(0, 3).map((cat, i) => (
                                        <span key={i} className={styles.tag}>{cat}</span>
                                    ))}
                                </div>
                            )}

                            {/* Summary */}
                            {file.summary && (
                                <p className={styles.summary}>{file.summary.substring(0, 120)}...</p>
                            )}

                            {/* Actions */}
                            <div className={styles.actions}>
                                <button
                                    className={styles.quizBtn}
                                    onClick={() => handleStartQuiz(file.id || file._id)}
                                >
                                    Start Quiz
                                </button>
                                <button
                                    className={styles.deleteBtn}
                                    onClick={() => handleDelete(file.id || file._id, file.filename)}
                                    disabled={deleting === (file.id || file._id)}
                                >
                                    {deleting === (file.id || file._id) ? '...' : '🗑️'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
