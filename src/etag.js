// ETag for a page body — a cache validator, not a signature.
//
// WHY (16 Sep 2026). Miguel: "all ships use starlink". The console's app shell is ~255KB of HTML and was
// served `no-store`, so every load, every refresh and every iframe open pulled the whole thing down again
// over a satellite link. With an ETag the browser STILL revalidates on every load (`private, no-cache`),
// so a deploy is picked up immediately — but when the bytes have not changed the answer is a 304 with no
// body. The fetch handler in worker.js turns a matching If-None-Match into that 304 for any response
// carrying an ETag, so a page only has to set the header.
//
// FNV-1a over the string: no crypto, no await, and a collision would only mean a client revalidating
// content it already has. Length is folded into the tag, which kills the realistic collision cases.
const _cache = new Map();

export function etagFor(body) {
  const hit = _cache.get(body);
  if (hit) return hit;
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) { h ^= body.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const tag = '"' + h.toString(36) + "-" + body.length.toString(36) + '"';
  // Bounded: most bodies here are module constants, but a page can be built per request.
  if (_cache.size > 16) _cache.clear();
  _cache.set(body, tag);
  return tag;
}

// One place that knows how an HTML page is served: revalidate always, never store in a shared cache
// (some pages carry a one-time token), and hand the browser a validator so an unchanged page is free.
export function htmlPage(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-cache", ETag: etagFor(body) },
  });
}
