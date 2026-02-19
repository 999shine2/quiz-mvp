const isDev = process.env.NODE_ENV !== 'production';

export const log = {
    info: (...args) => { if (isDev) console.log(...args); },
    warn: (...args) => { if (isDev) console.warn(...args); },
    error: (...args) => { console.error(...args); },
    important: (...args) => { console.log(...args); }
};
