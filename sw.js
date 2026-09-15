// Acappella Studio — offline 앱 셸 서비스워커
//
// 목표: 연습실/공연장처럼 네트워크가 불안정한 곳에서도 한 번 로딩한 뒤에는
// 앱 자체(index.html/설정)와 pdf.js·Firebase SDK 같은 외부 스크립트는 오프라인에서도 뜨게 한다.
// 악보 PDF/오디오 파일 자체는 앱이 이미 IndexedDB(pdf_cache)에 캐싱하므로 여기서는 건드리지 않고,
// Google Drive/Firestore/YouTube 같은 API 요청은 항상 네트워크로 그대로 흘려보낸다(가로채지 않음).
//
// 버전을 올리면(CACHE_VERSION 변경) 구 캐시는 activate 시점에 자동 정리된다.
const CACHE_VERSION = 'v1';
const SHELL_CACHE = `acappella-shell-${CACHE_VERSION}`;
const VENDOR_CACHE = `acappella-vendor-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './config.json',
  './apple-touch-icon.png'
];

// 버전이 URL에 고정되어 있어 캐시가 절대 낡을 일이 없는 외부 스크립트들 (cache-first 대상)
const VENDOR_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {}),
      caches.open(VENDOR_CACHE).then((cache) => cache.addAll(VENDOR_ASSETS)).catch(() => {})
    ])
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const keep = [SHELL_CACHE, VENDOR_CACHE];
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => !keep.includes(n)).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // Firestore 쓰기 등은 절대 건드리지 않음

  const url = new URL(req.url);

  // 1) 고정 버전 외부 스크립트: cache-first (URL 자체가 버전 고정이라 항상 안전)
  if (VENDOR_ASSETS.includes(req.url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const clone = res.clone();
          caches.open(VENDOR_CACHE).then((cache) => cache.put(req, clone)).catch(() => {});
          return res;
        });
      })
    );
    return;
  }

  // 2) 같은 오리진(앱 셸): network-first — 새 버전이 있으면 항상 그걸 보여주고,
  //    오프라인일 때만 캐시로 폴백한다. (구버전에 영구히 갇히는 것 방지)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, clone)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  // 3) 그 외(Google Drive / Firestore / YouTube 등 API 요청)는 절대 가로채지 않음 — 항상 네트워크로.
});
