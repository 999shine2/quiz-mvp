import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setToken, getStoredUser, setStoredUser } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => getStoredUser());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const isAuthenticated = !!user;

    const clearError = useCallback(() => setError(null), []);

    const login = useCallback(async (userId, password) => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.post('/api/auth/login', { userId, password });
            setToken(data.token);
            const userData = { userId: data.userId, nickname: data.nickname };
            setStoredUser(userData);
            setUser(userData);
            return data;
        } catch (err) {
            setError(err.message || 'Login failed');
            throw err;
        } finally {
            setLoading(false);
        }
    }, []);

    const register = useCallback(async (userId, password, nickname) => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.post('/api/auth/register', { userId, password, nickname });
            setToken(data.token);
            const userData = { userId: data.userId, nickname: data.nickname };
            setStoredUser(userData);
            setUser(userData);
            return data;
        } catch (err) {
            setError(err.message || 'Registration failed');
            throw err;
        } finally {
            setLoading(false);
        }
    }, []);

    const logout = useCallback(() => {
        setToken(null);
        setStoredUser(null);
        setUser(null);
    }, []);

    const value = {
        user,
        isAuthenticated,
        loading,
        error,
        clearError,
        login,
        register,
        logout,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export default AuthContext;
