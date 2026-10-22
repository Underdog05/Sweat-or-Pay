const CACHE = "sweat-or-pay-v7";
const SHELL = ["./", "./index.html", "./style.css", "./app.js", "./config.js", "./manifest.webmanifest", "./icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const options = {
    body: data.body || "Neue Nachricht",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: data.tag || "chat",
    renotify: true,
    data: { url: data.url || "./" },
  };
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const isApple = /iPhone|iPad|iPod/i.test(self.navigator.userAgent);
    // Apple verlangt zu jeder Push-Nachricht eine sichtbare Meldung. Sonst ist nichts nötig, wenn die App gerade vorne offen ist.
    if (!isApple && wins.some((w) => w.focused)) return;
    await self.registration.showNotification(data.title || "Sweat or Pay", options);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "./", self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if ("focus" in w) {
        await w.focus();
        if ("navigate" in w) { try { await w.navigate(target); } catch (e) { /* bleibt auf der aktuellen Seite */ } }
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Firebase-Bibliothek (fest versioniert): einmal laden, danach aus dem Cache.
  if (url.origin === "https://www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
  );
});

