self.addEventListener('push', (event) => {
  const payload = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return {};
    }
  })();

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const hasVisibleClient = clientList.some((client) => client.visibilityState === 'visible' || client.focused);

    if (hasVisibleClient) {
      for (const client of clientList) {
        client.postMessage({ type: 'intranet-push-received', payload });
      }
      return;
    }

    await self.registration.showNotification(payload.title || 'Nova notificação', {
      body: payload.body || '',
      tag: payload.tag || undefined,
      icon: payload.icon || '/favicon.ico',
      badge: payload.badge || '/favicon.ico',
      data: payload.data || {},
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = String(event.notification.data?.href || '/');
  const notificationId = String(event.notification.data?.notificationId || '');

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    for (const client of clientList) {
      if ('focus' in client) {
        await client.focus();
      }
      if ('navigate' in client && href) {
        await client.navigate(href);
      }
      client.postMessage({
        type: 'intranet-push-click',
        payload: {
          href,
          notificationId,
        },
      });
      return;
    }

    if (self.clients.openWindow) {
      const nextClient = await self.clients.openWindow(href);
      if (nextClient) {
        nextClient.postMessage({
          type: 'intranet-push-click',
          payload: {
            href,
            notificationId,
          },
        });
      }
    }
  })());
});
