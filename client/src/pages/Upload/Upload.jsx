import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client.js';
import styles from './Upload.module.css';

const TABS = [
    { id: 'document', icon: '📄', label: 'Document' },
    { id: 'youtube', icon: '🎬', label: 'YouTube' },
    { id: 'creative', icon: '🎨', label: 'Creative' },
];

export default function Upload() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('document');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');

    // Document state
    const [file, setFile] = useState(null);
    const [dragOver, setDragOver] = useState(false);

    // YouTube state
    const [youtubeUrl, setYoutubeUrl] = useState('');

    // Creative state
    const [creativeTitle, setCreativeTitle] = useState('');
    const [creativeAuthor, setCreativeAuthor] = useState('');
    const [creativeType, setCreativeType] = useState('book');

    const handleFileChange = (e) => {
        const selected = e.target.files?.[0];
        if (selected) setFile(selected);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) setFile(dropped);
    };

    const handleDocumentUpload = async () => {
        if (!file) { setError('Please select a file.'); return; }
        setLoading(true);
        setStatus('Uploading & parsing document...');
        setError('');
        try {
            const formData = new FormData();
            formData.append('file', file);
            const result = await api.upload('/api/files/upload', formData);
            setStatus('✅ Quiz generated!');
            setTimeout(() => navigate('/library'), 1000);
        } catch (err) {
            setError(err.message || 'Upload failed');
            setStatus('');
        } finally {
            setLoading(false);
        }
    };

    const handleYoutubeGenerate = async () => {
        if (!youtubeUrl.trim()) { setError('Please enter a YouTube URL.'); return; }
        setLoading(true);
        setStatus('Fetching transcript...');
        setError('');
        try {
            await api.post('/api/youtube/generate', { url: youtubeUrl.trim() });
            setStatus('✅ Quiz generated!');
            setTimeout(() => navigate('/library'), 1000);
        } catch (err) {
            setError(err.message || 'Failed to generate quiz');
            setStatus('');
        } finally {
            setLoading(false);
        }
    };

    const handleCreativeGenerate = async () => {
        if (!creativeTitle.trim()) { setError('Please enter a title.'); return; }
        setLoading(true);
        setStatus('Creating quiz...');
        setError('');
        try {
            await api.post('/api/creative/generate', {
                title: creativeTitle.trim(),
                author: creativeAuthor.trim(),
                type: creativeType,
            });
            setStatus('✅ Quiz generated!');
            setTimeout(() => navigate('/library'), 1000);
        } catch (err) {
            setError(err.message || 'Failed to generate quiz');
            setStatus('');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Create Quiz</h1>

            {/* Tabs */}
            <div className={styles.tabs}>
                {TABS.map(({ id, icon, label }) => (
                    <button
                        key={id}
                        className={`${styles.tab} ${activeTab === id ? styles.tabActive : ''}`}
                        onClick={() => { setActiveTab(id); setError(''); setStatus(''); }}
                        disabled={loading}
                    >
                        {icon} {label}
                    </button>
                ))}
            </div>

            {/* Document Tab */}
            {activeTab === 'document' && (
                <div className={styles.panel}>
                    <div
                        className={`${styles.dropZone} ${dragOver ? styles.dragOver : ''} ${file ? styles.hasFile : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => document.getElementById('file-input').click()}
                    >
                        <span className={styles.dropIcon}>{file ? '✅' : '📎'}</span>
                        <p className={styles.dropText}>
                            {file ? file.name : 'Drop a file or tap to browse'}
                        </p>
                        <p className={styles.dropHint}>PDF, DOCX, TXT, or Markdown</p>
                        <input
                            id="file-input"
                            type="file"
                            accept=".pdf,.docx,.txt,.md,.doc"
                            onChange={handleFileChange}
                            hidden
                        />
                    </div>
                    <button
                        className={styles.generateBtn}
                        onClick={handleDocumentUpload}
                        disabled={loading || !file}
                    >
                        {loading ? 'Generating...' : 'Generate Quiz'}
                    </button>
                </div>
            )}

            {/* YouTube Tab */}
            {activeTab === 'youtube' && (
                <div className={styles.panel}>
                    <div className={styles.inputGroup}>
                        <span className={styles.inputIcon}>🔗</span>
                        <input
                            type="url"
                            placeholder="Paste YouTube URL..."
                            value={youtubeUrl}
                            onChange={(e) => setYoutubeUrl(e.target.value)}
                            className={styles.urlInput}
                        />
                    </div>
                    <button
                        className={styles.generateBtn}
                        onClick={handleYoutubeGenerate}
                        disabled={loading || !youtubeUrl.trim()}
                    >
                        {loading ? 'Generating...' : 'Generate Quiz'}
                    </button>
                </div>
            )}

            {/* Creative Tab */}
            {activeTab === 'creative' && (
                <div className={styles.panel}>
                    <select
                        value={creativeType}
                        onChange={(e) => setCreativeType(e.target.value)}
                        className={styles.typeSelect}
                    >
                        <option value="book">📚 Book</option>
                        <option value="movie">🎬 Movie</option>
                        <option value="show">📺 TV Show</option>
                        <option value="game">🎮 Video Game</option>
                        <option value="album">🎵 Album</option>
                    </select>
                    <input
                        type="text"
                        placeholder="Title (e.g. The Great Gatsby)"
                        value={creativeTitle}
                        onChange={(e) => setCreativeTitle(e.target.value)}
                        className={styles.textInput}
                    />
                    <input
                        type="text"
                        placeholder="Author / Director (optional)"
                        value={creativeAuthor}
                        onChange={(e) => setCreativeAuthor(e.target.value)}
                        className={styles.textInput}
                    />
                    <button
                        className={styles.generateBtn}
                        onClick={handleCreativeGenerate}
                        disabled={loading || !creativeTitle.trim()}
                    >
                        {loading ? 'Generating...' : 'Generate Quiz'}
                    </button>
                </div>
            )}

            {/* Status / Error */}
            {status && <p className={styles.status}>{status}</p>}
            {error && <p className={styles.error}>{error}</p>}
        </div>
    );
}
