// PHL Land Care CRM — Service Worker permanent kill-switch.
// A caching service worker previously shipped from this exact file path and
// got installed on some devices. Browsers keep re-running an already-installed
// service worker indefinitely until it's explicitly replaced/unregistered —
// simply deleting this file from the deployed site does NOT remove it from
// devices that already installed the old version. This file must keep
// existing at this same path, with this self-destructing logic, forever —
// removing it again would let old installs silently keep serving stale
// cached pages to whoever has it.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.map(k => caches.delete(k)))
      await self.registration.unregister()
      const clientsList = await self.clients.matchAll({ type: 'window' })
      clientsList.forEach(c => c.navigate(c.url))
    })()
  )
})
