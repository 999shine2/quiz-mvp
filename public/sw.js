// Insighter Service Worker — Study Reminders
'use strict';

let reminderConfig = null;
let lastNotificationDate = null;

// Listen for messages from main thread
self.addEventListener('message', (event) => {
    const { type, data } = event.data || {};

    if (type === 'SET_REMINDER') {
        reminderConfig = data; // { enabled, hour, minute, dueCount, streak }
        lastNotificationDate = null; // Reset so it can fire today
    }

    if (type === 'CLEAR_REMINDER') {
        reminderConfig = null;
    }
});

// Periodic check (every 60 seconds while SW is alive)
setInterval(() => {
    if (!reminderConfig || !reminderConfig.enabled) return;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Only fire once per day
    if (lastNotificationDate === todayStr) return;

    if (now.getHours() === reminderConfig.hour && now.getMinutes() === reminderConfig.minute) {
        const dueCount = reminderConfig.dueCount || 0;
        const streak = reminderConfig.streak || 0;

        let body = dueCount > 0
            ? `You have ${dueCount} questions due for review.`
            : 'Keep your knowledge fresh — review some questions!';
        if (streak > 0) body += ` ${streak}-day streak!`;

        self.registration.showNotification('Time to study!', {
            body,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: 'study-reminder',
            renotify: true
        });

        lastNotificationDate = todayStr;
    }
}, 60000);

// Handle notification click — open or focus the app
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(clientList => {
            for (const client of clientList) {
                if ('focus' in client) return client.focus();
            }
            return clients.openWindow('/');
        })
    );
});

// Share Target — intercept /share requests and redirect to main app with URL param
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (url.pathname === '/share') {
        const sharedUrl = url.searchParams.get('url') || url.searchParams.get('text') || '';
        event.respondWith(Response.redirect(`/?shared_url=${encodeURIComponent(sharedUrl)}`));
        return;
    }
});

// Install & activate immediately
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
