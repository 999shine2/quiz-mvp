import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client.js';
import styles from './Reels.module.css';

export default function Reels() {
    const [reels, setReels] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [revealed, setRevealed] = useState(false);
    const [selectedOption, setSelectedOption] = useState(null);

    // Load pregenerated reels
    useEffect(() => {
        const loadReels = async () => {
            try {
                const data = await api.get('/api/reels/pregenerated');
                const items = Array.isArray(data) ? data : data.questions || [];
                setReels(items);
            } catch (err) {
                console.error('Failed to load reels:', err);
            } finally {
                setLoading(false);
            }
        };
        loadReels();
    }, []);

    const current = reels[currentIndex];
    const question = current?.question;
    const questionText = typeof question === 'string' ? question : question?.question || '';
    const options = question?.options || [];
    const correctIdx = question?.correctIndex ?? question?.correct_index ?? 0;
    const explanation = question?.explanation || '';
    const isMCQ = options.length > 0;
    const sourceName = current?.originFilename || current?.sourceTitle || current?.materialName || '';

    const handleSelect = (index) => {
        if (revealed) return;
        setSelectedOption(index);
        setRevealed(true);
    };

    const handleReveal = () => {
        setRevealed(true);
    };

    const handleNext = useCallback(() => {
        if (currentIndex < reels.length - 1) {
            setCurrentIndex((i) => i + 1);
            setRevealed(false);
            setSelectedOption(null);
        } else {
            // Try to load more
            api.post('/api/reels/generate-more', {}).then((data) => {
                const newQs = data?.questions || [];
                if (newQs.length > 0) {
                    setReels((prev) => [...prev, ...newQs]);
                    setCurrentIndex((i) => i + 1);
                    setRevealed(false);
                    setSelectedOption(null);
                }
            }).catch(() => { });
        }
    }, [currentIndex, reels.length]);

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex((i) => i - 1);
            setRevealed(false);
            setSelectedOption(null);
        }
    };

    // Swipe handling
    const [touchStart, setTouchStart] = useState(null);

    const handleTouchStart = (e) => setTouchStart(e.touches[0].clientY);
    const handleTouchEnd = (e) => {
        if (touchStart === null) return;
        const diff = touchStart - e.changedTouches[0].clientY;
        if (diff > 60) handleNext(); // Swipe up
        else if (diff < -60) handlePrev(); // Swipe down
        setTouchStart(null);
    };

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>
                    <span className={styles.spinner}>🎴</span>
                    <p>Loading reels...</p>
                </div>
            </div>
        );
    }

    if (reels.length === 0) {
        return (
            <div className={styles.container}>
                <div className={styles.empty}>
                    <span style={{ fontSize: '3rem' }}>🎴</span>
                    <h2>No Reels Yet</h2>
                    <p>Upload some materials first, then come back for flash cards!</p>
                </div>
            </div>
        );
    }

    return (
        <div
            className={styles.container}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            {/* Background image */}
            {current?.imageUrl && (
                <div
                    className={styles.bgImage}
                    style={{ backgroundImage: `url(${current.imageUrl})` }}
                />
            )}

            <div className={styles.overlay}>
                {/* Source label */}
                {sourceName && (
                    <span className={styles.source}>{sourceName}</span>
                )}

                {/* Question */}
                <div className={styles.questionArea}>
                    <p className={styles.questionText}>{questionText}</p>

                    {/* MCQ */}
                    {isMCQ && (
                        <div className={styles.options}>
                            {options.map((opt, i) => {
                                let cls = styles.option;
                                if (revealed) {
                                    if (i === correctIdx) cls += ` ${styles.correct}`;
                                    else if (i === selectedOption) cls += ` ${styles.incorrect}`;
                                } else if (i === selectedOption) {
                                    cls += ` ${styles.selected}`;
                                }
                                return (
                                    <button key={i} className={cls} onClick={() => handleSelect(i)}>
                                        {opt}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Non-MCQ reveal */}
                    {!isMCQ && !revealed && (
                        <button className={styles.tapReveal} onClick={handleReveal}>
                            Tap to reveal answer
                        </button>
                    )}

                    {/* Explanation */}
                    {revealed && (explanation || question?.answer) && (
                        <div className={styles.explanation}>
                            {question?.answer && !isMCQ && (
                                <p className={styles.answerText}>{question.answer}</p>
                            )}
                            {explanation && <p className={styles.explText}>{explanation}</p>}
                        </div>
                    )}
                </div>

                {/* Counter */}
                <div className={styles.counter}>
                    {currentIndex + 1} / {reels.length}
                </div>

                {/* Navigation hint */}
                <div className={styles.swipeHint}>↑ Swipe to continue ↑</div>
            </div>
        </div>
    );
}
