import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client.js';
import styles from './Quiz.module.css';

export default function Quiz() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [material, setMaterial] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Answer state
    const [selectedOption, setSelectedOption] = useState(null);
    const [textAnswer, setTextAnswer] = useState('');
    const [revealed, setRevealed] = useState(false);
    const [score, setScore] = useState({ correct: 0, wrong: 0 });

    // Load material
    useEffect(() => {
        const loadMaterial = async () => {
            try {
                const data = await api.get(`/api/materials/${id}`);
                const mat = data.material || data;
                setMaterial(mat);
                const qs = mat.questions || [];
                setQuestions(qs);
            } catch (err) {
                setError(err.message || 'Failed to load quiz');
            } finally {
                setLoading(false);
            }
        };
        loadMaterial();
    }, [id]);

    const question = questions[currentIndex];
    const isLast = currentIndex === questions.length - 1;
    const isMCQ = question?.type === 'mcq' || question?.options?.length > 0;

    const handleSelectOption = (index) => {
        if (revealed) return;
        setSelectedOption(index);
    };

    const handleReveal = useCallback(() => {
        if (revealed) return;
        setRevealed(true);

        if (isMCQ) {
            const correctIndex = question.options?.findIndex(
                (opt) => opt === question.answer || opt === question.correctAnswer
            );
            const correctIdx = question.correctIndex ?? question.correct_index ?? correctIndex ?? 0;

            if (selectedOption === correctIdx) {
                setScore((s) => ({ ...s, correct: s.correct + 1 }));
            } else {
                setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
            }
        }
    }, [revealed, isMCQ, selectedOption, question]);

    const handleNext = () => {
        if (isLast) {
            // Track solves
            api.post('/api/track/solve', {
                count: questions.length,
                correct: score.correct,
                wrong: score.wrong,
                materialName: material?.filename,
            }).catch(() => { });

            return;
        }

        setCurrentIndex((i) => i + 1);
        setSelectedOption(null);
        setTextAnswer('');
        setRevealed(false);
    };

    // Loading state
    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>
                    <span className={styles.spinner}>📝</span>
                    <p>Loading quiz...</p>
                </div>
            </div>
        );
    }

    if (error || questions.length === 0) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>
                    <span style={{ fontSize: '2rem' }}>😕</span>
                    <p>{error || 'No questions found.'}</p>
                    <button className={styles.backBtn} onClick={() => navigate('/library')}>
                        Back to Library
                    </button>
                </div>
            </div>
        );
    }

    // Results screen
    if (isLast && revealed) {
        const total = score.correct + score.wrong;
        const pct = total > 0 ? Math.round((score.correct / total) * 100) : 0;
        return (
            <div className={styles.container}>
                <div className={styles.results}>
                    <span className={styles.resultsEmoji}>
                        {pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '📖'}
                    </span>
                    <h1 className={styles.resultsTitle}>
                        {pct >= 80 ? 'Excellent!' : pct >= 50 ? 'Good Job!' : 'Keep Studying!'}
                    </h1>
                    <div className={styles.resultsScore}>
                        <span className={styles.resultsPct}>{pct}%</span>
                        <span className={styles.resultsDetail}>
                            {score.correct} / {total} correct
                        </span>
                    </div>
                    <div className={styles.resultsActions}>
                        <button
                            className={styles.retryBtn}
                            onClick={() => {
                                setCurrentIndex(0);
                                setScore({ correct: 0, wrong: 0 });
                                setSelectedOption(null);
                                setTextAnswer('');
                                setRevealed(false);
                            }}
                        >
                            Retry Quiz
                        </button>
                        <button
                            className={styles.backBtn}
                            onClick={() => navigate('/library')}
                        >
                            Back to Library
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Get correct answer index
    const correctIndex = question.options?.findIndex(
        (opt) => opt === question.answer || opt === question.correctAnswer
    );
    const correctIdx = question.correctIndex ?? question.correct_index ?? correctIndex ?? 0;

    return (
        <div className={styles.container}>
            {/* Progress bar */}
            <div className={styles.progressBar}>
                <div
                    className={styles.progressFill}
                    style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                />
            </div>

            {/* Header */}
            <div className={styles.header}>
                <button className={styles.closeBtn} onClick={() => navigate('/library')}>✕</button>
                <span className={styles.counter}>
                    {currentIndex + 1} / {questions.length}
                </span>
                <span className={styles.scoreDisplay}>
                    ✅ {score.correct}  ❌ {score.wrong}
                </span>
            </div>

            {/* Question */}
            <div className={styles.questionCard}>
                <p className={styles.questionText}>
                    {question.question?.question || question.question || 'Question'}
                </p>

                {/* MCQ Options */}
                {isMCQ && question.options && (
                    <div className={styles.options}>
                        {question.options.map((opt, i) => {
                            let optClass = styles.option;
                            if (revealed) {
                                if (i === correctIdx) optClass += ` ${styles.correct}`;
                                else if (i === selectedOption) optClass += ` ${styles.incorrect}`;
                            } else if (i === selectedOption) {
                                optClass += ` ${styles.selected}`;
                            }

                            return (
                                <button
                                    key={i}
                                    className={optClass}
                                    onClick={() => handleSelectOption(i)}
                                    disabled={revealed}
                                >
                                    {opt}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Written Answer */}
                {!isMCQ && (
                    <div className={styles.writtenArea}>
                        <textarea
                            placeholder="Type your answer..."
                            value={textAnswer}
                            onChange={(e) => setTextAnswer(e.target.value)}
                            className={styles.textarea}
                            disabled={revealed}
                            rows={3}
                        />
                    </div>
                )}

                {/* Reveal / Next */}
                <div className={styles.actionBar}>
                    {!revealed ? (
                        <button
                            className={styles.revealBtn}
                            onClick={handleReveal}
                            disabled={isMCQ && selectedOption === null}
                        >
                            {isMCQ ? 'Check Answer' : 'Show Answer'}
                        </button>
                    ) : (
                        <button className={styles.nextBtn} onClick={handleNext}>
                            {isLast ? 'See Results' : 'Next Question →'}
                        </button>
                    )}
                </div>

                {/* Explanation */}
                {revealed && (question.explanation || question.answer) && (
                    <div className={styles.explanation}>
                        {!isMCQ && (
                            <p className={styles.correctAnswer}>
                                <strong>Answer:</strong> {question.answer || question.correctAnswer}
                            </p>
                        )}
                        {question.explanation && (
                            <p className={styles.explanationText}>{question.explanation}</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
