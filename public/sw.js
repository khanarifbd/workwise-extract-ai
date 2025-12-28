// Service Worker for Push Notifications
self.addEventListener('install', (event) => {
  console.log('Service Worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activated');
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  console.log('Push notification received:', event);

  let data = {
    title: 'New Job Assignment',
    body: 'You have a new job assigned to your team',
    icon: '/logo.png',
    badge: '/logo.png',
    tag: 'job-assignment',
    data: {},
  };

  try {
    if (event.data) {
      const payload = event.data.json();
      data = { ...data, ...payload };
    }
  } catch (e) {
    console.error('Error parsing push data:', e);
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    data: data.data,
    vibrate: [200, 100, 200],
    requireInteraction: true,
    actions: [
      { action: 'view', title: 'জব দেখুন' },
      { action: 'dismiss', title: 'বাতিল' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);

  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  // Get job data from notification
  const notificationData = event.notification.data || {};
  const jobId = notificationData.jobId;
  const teamId = notificationData.teamId;

  // Build the target URL
  let targetUrl = '/team';
  if (jobId) {
    targetUrl = `/team?job=${jobId}`;
  }

  // Open or focus the team portal with specific job
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to find an existing window
      for (const client of clientList) {
        if (client.url.includes('/team') && 'focus' in client) {
          // Navigate to the specific job
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            jobId: jobId,
            teamId: teamId,
          });
          return client.focus();
        }
      }
      // Open new window if none found
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
