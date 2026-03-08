import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import styles from './Login.module.css';

export default function Login() {
    const { login, register, loading, error, clearError } = useAuth();
    const [isRegister, setIsRegister] = useState(false);
    const [userId, setUserId] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [nickname, setNickname] = useState('');
    const [localError, setLocalError] = useState('');

    const toggleMode = (e) => {
        e.preventDefault();
        setIsRegister(!isRegister);
        setLocalError('');
        clearError();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLocalError('');

        if (!userId.trim() || !password.trim()) {
            setLocalError('Please fill in all fields.');
            return;
        }

        if (isRegister) {
            if (password !== confirmPassword) {
                setLocalError('Passwords do not match.');
                return;
            }
            if (password.length < 6) {
                setLocalError('Password must be at least 6 characters.');
                return;
            }
            if (!nickname.trim()) {
                setLocalError('Please enter a nickname.');
                return;
            }
            try {
                await register(userId.trim(), password, nickname.trim());
            } catch {
                // Error is handled by AuthContext
            }
        } else {
            try {
                await login(userId.trim(), password);
            } catch {
                // Error is handled by AuthContext
            }
        }
    };

    const displayError = localError || error;

    return (
        <div className={styles.screen}>
            <form className={styles.card} onSubmit={handleSubmit}>
                <h1 className={styles.logo}>insighter</h1>
                <p className={styles.subtitle}>
                    {isRegister ? 'Create Account' : 'Welcome Back'}
                </p>

                <div className={styles.form}>
                    <input
                        type="text"
                        placeholder="User ID"
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                        className={styles.input}
                        autoComplete="username"
                        id="login-userid"
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={styles.input}
                        autoComplete={isRegister ? 'new-password' : 'current-password'}
                        id="login-password"
                    />

                    {isRegister && (
                        <>
                            <input
                                type="password"
                                placeholder="Confirm Password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className={styles.input}
                                autoComplete="new-password"
                                id="login-password-confirm"
                            />
                            <input
                                type="text"
                                placeholder="Nickname (Public Name)"
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                                className={styles.input}
                                id="login-nickname"
                            />
                        </>
                    )}

                    {displayError && (
                        <p className={styles.error}>{displayError}</p>
                    )}

                    <button
                        type="submit"
                        className={styles.submitBtn}
                        disabled={loading}
                        id={isRegister ? 'register-btn' : 'login-btn'}
                    >
                        {loading
                            ? (isRegister ? 'Creating...' : 'Logging in...')
                            : (isRegister ? 'Create Account' : 'Log In')
                        }
                    </button>
                </div>

                <p className={styles.toggleText}>
                    <a href="#" onClick={toggleMode} id="auth-toggle-link">
                        {isRegister
                            ? 'Already have an account? Log In'
                            : 'New here? Create Account'
                        }
                    </a>
                </p>
            </form>
        </div>
    );
}
