import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import styles from './Profile.module.css';

export default function Profile() {
    const { user, logout } = useAuth();
    const { data: profile, loading, error } = useApi('/api/profile');

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>
                    <span className={styles.spinner}>🌿</span>
                    <p>Loading profile...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.container}>
                <div className={styles.error}>
                    <p>Failed to load profile</p>
                    <p className={styles.errorDetail}>{error}</p>
                </div>
            </div>
        );
    }

    if (!profile) return null;

    const {
        totalQuestionsSolved = 0,
        totalTimeSavedMins = 0,
        dailyStats = {},
        topSubjects = [],
        currentStreak = 0,
    } = profile;

    // Format time
    const hours = Math.floor(totalTimeSavedMins / 60);
    const mins = totalTimeSavedMins % 60;
    const timeDisplay = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    // Daily chart data
    const days = Object.entries(dailyStats).sort(([a], [b]) => a.localeCompare(b));
    const maxSolved = Math.max(...days.map(([, d]) => d.solved), 1);

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.avatar}>
                    {(user?.nickname || user?.userId || '?')[0].toUpperCase()}
                </div>
                <h1 className={styles.nickname}>{user?.nickname || user?.userId}</h1>
                <p className={styles.userId}>@{user?.userId}</p>
            </div>

            {/* Streak Badge */}
            {currentStreak > 0 && (
                <div className={styles.streakBadge}>
                    <span className={styles.streakEmoji}>🔥</span>
                    <span className={styles.streakCount}>{currentStreak} day streak!</span>
                </div>
            )}

            {/* Stats Grid */}
            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <span className={styles.statValue}>{totalQuestionsSolved}</span>
                    <span className={styles.statLabel}>Questions Solved</span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statValue}>{timeDisplay}</span>
                    <span className={styles.statLabel}>Time Invested</span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statValue}>{topSubjects.length}</span>
                    <span className={styles.statLabel}>Topics Studied</span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statValue}>{currentStreak}</span>
                    <span className={styles.statLabel}>Day Streak</span>
                </div>
            </div>

            {/* 7-Day Activity Chart */}
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Last 7 Days</h2>
                <div className={styles.chart}>
                    {days.map(([date, data]) => {
                        const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('en', { weekday: 'short' });
                        const height = Math.max((data.solved / maxSolved) * 100, 4);
                        return (
                            <div key={date} className={styles.chartBar}>
                                <div className={styles.barContainer}>
                                    <div
                                        className={`${styles.bar} ${data.solved > 0 ? styles.barActive : ''}`}
                                        style={{ height: `${height}%` }}
                                    />
                                </div>
                                <span className={styles.barLabel}>{dayLabel}</span>
                                <span className={styles.barValue}>{data.solved || ''}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Top Subjects */}
            {topSubjects.length > 0 && (
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>Top Subjects</h2>
                    <div className={styles.subjectList}>
                        {topSubjects.slice(0, 8).map((subject, i) => (
                            <div key={i} className={styles.subjectCard}>
                                <span className={styles.subjectEmoji}>{subject.emoji || '📚'}</span>
                                <div className={styles.subjectInfo}>
                                    <span className={styles.subjectName}>{subject.name}</span>
                                    <span className={styles.subjectMeta}>
                                        {subject.count} questions · {subject.timeSaved}m saved
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Logout */}
            <button className={styles.logoutBtn} onClick={logout}>
                Log Out
            </button>
        </div>
    );
}
