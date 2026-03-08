import { useNavigate, useLocation } from 'react-router-dom';
import styles from './BottomNav.module.css';

const NAV_ITEMS = [
    { path: '/upload', icon: '📤', label: 'Upload' },
    { path: '/library', icon: '📚', label: 'Library' },
    { path: '/reels', icon: '🎴', label: 'Reels' },
    { path: '/profile', icon: '👤', label: 'Profile' },
];

export default function BottomNav() {
    const navigate = useNavigate();
    const location = useLocation();

    // Hide nav on quiz screen (full-screen experience)
    if (location.pathname.startsWith('/quiz')) return null;

    return (
        <nav className={styles.nav}>
            {NAV_ITEMS.map(({ path, icon, label }) => (
                <button
                    key={path}
                    className={`${styles.item} ${location.pathname === path ? styles.active : ''}`}
                    onClick={() => navigate(path)}
                    aria-label={label}
                >
                    <span className={styles.icon}>{icon}</span>
                    <span className={styles.label}>{label}</span>
                </button>
            ))}
        </nav>
    );
}
