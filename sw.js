// PHL Land Care CRM — Service Worker
const CACHE = 'phl-crm-v14'
const OFFLINE_URLS = ['/phl-crm/', '/phl-crm/index.html']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(OFFLINE_URLS)).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  // Delete ALL old caches on activate
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))))
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  // Network first, fall back to cache for navigation requests
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/phl-crm/index.html'))
    )
    return
  }
  // Cache first for static assets
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone))
      }
      return res
    }))
  )
})
