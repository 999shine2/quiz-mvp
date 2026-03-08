import { useState, useEffect, useCallback } from 'react';
import api from '../api/client.js';

/**
 * Custom hook for API data fetching with loading/error states.
 * @param {string} endpoint - API endpoint to fetch
 * @param {object} options - { immediate: true } to fetch on mount
 */
export function useApi(endpoint, options = {}) {
    const { immediate = true } = options;
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(immediate);
    const [error, setError] = useState(null);

    const execute = useCallback(async (overrideEndpoint) => {
        const url = overrideEndpoint || endpoint;
        if (!url) return;

        setLoading(true);
        setError(null);
        try {
            const result = await api.get(url);
            setData(result);
            return result;
        } catch (err) {
            setError(err.message || 'Request failed');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [endpoint]);

    useEffect(() => {
        if (immediate && endpoint) {
            execute().catch(() => { }); // Error is captured in state
        }
    }, [immediate, endpoint, execute]);

    return { data, loading, error, refetch: execute, setData };
}

export default useApi;
