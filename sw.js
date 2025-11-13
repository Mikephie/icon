// sw.js
const CACHE_NAME = 'icon-cache-v1';

// ❗ 临时修复：清空缓存列表，确保安装成功
const urlsToCache = [
    // 列表为空，Service Worker 不会因为 404 而失败
];

// 监听安装事件
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache - (Temporarily empty cache list)');
                return cache.addAll(urlsToCache); // 此时这个操作会成功
            })
    );
});

// 监听获取（fetch）事件，用于返回缓存的资源
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // 如果缓存中有，则返回缓存的资源
                if (response) {
                    return response;
                }
                // 否则，从网络获取
                return fetch(event.request);
            })
    );
});

// 监听激活事件，用于清理旧缓存
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});