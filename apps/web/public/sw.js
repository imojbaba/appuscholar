/* Appuscholar service worker (wave C, Task C8).
   It keeps three kinds of file and nothing else: the app's hashed static files (/_next/static/*, which include the fonts), the two icons, and one
   offline page. It never keeps a page of the app, an /api answer, anything from another site, or any response that sets a cookie, so an offline
   visit can never show someone else's page or old private data. A page that loads is passed through untouched; only when the network itself fails
   does a page request get /offline.html. ?nosw=1 on any page switches the worker off and clears its copies (lib/help/install/register.ts). */
var VER = "appu-wc-1";
var PRECACHE = ["/offline.html", "/icon-192.png", "/icon-512.png"];

/* What to do with a request: "ignore" (the browser goes to the network itself), "navigate" (network first, offline page on failure) or
   "cache-first". With the response in hand, what to do with it: "store" or "skip" (cache-first), "pass" (a navigation: never stored), "ignore". */
function decide(request, response) {
  var route = routeOf(request);
  if (response === undefined) return route;
  if (route === "cache-first") return storable(response) ? "store" : "skip";
  if (route === "navigate") return "pass";
  return "ignore";
}

function routeOf(request) {
  if (request.method !== "GET") return "ignore";
  var url;
  try { url = new URL(request.url); } catch (e) { return "ignore"; }
  if (url.origin !== self.location.origin) return "ignore";
  var p = url.pathname;
  if (p === "/api" || p.indexOf("/api/") === 0) return "ignore";
  if (p === "/sw.js") return "ignore";
  if (request.mode === "navigate") return "navigate";
  if (request.headers && request.headers.get("rsc")) return "ignore";
  if (p.indexOf("/_next/static/") === 0 || p === "/icon-192.png" || p === "/icon-512.png" || /\.(woff2?|ttf|otf)$/.test(p)) return "cache-first";
  return "ignore";
}

function storable(response) {
  if (!response || !response.ok || response.type !== "basic") return false;
  if (response.headers.has("set-cookie")) return false;
  return !/text\/html/i.test(response.headers.get("content-type") || "");
}

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VER).then(function (c) { return c.addAll(PRECACHE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf("appu-") === 0 && k !== VER; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  var route = decide(req);
  if (route === "ignore") return;
  if (route === "navigate") {
    e.respondWith(fetch(req).catch(function () {
      return caches.open(VER).then(function (c) { return c.match("/offline.html"); }).then(function (hit) { if (hit) return hit; throw new Error("offline"); });
    }));
    return;
  }
  e.respondWith(caches.open(VER).then(function (c) {
    return c.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (decide(req, res) === "store") c.put(req, res.clone()).catch(function () {});
        return res;
      });
    });
  }));
});
