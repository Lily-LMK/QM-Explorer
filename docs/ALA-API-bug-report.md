# Bug report: missing CORS header on `/ws/occurrences/search` when filters are AND-joined in a single `fq`

**Service:** ALA Biocache web service — `https://biocache-ws.ala.org.au/ws/occurrences/search`
**Reported by:** Lily Kumpe (Queensland Museum) — QM Collections Explorer, a browser-based ALA client
**Date observed:** June 2026
**Severity:** High for browser-based clients — silently breaks any cross-origin (CORS) request that uses an AND-joined `fq`.

---

## Summary

When two or more filter clauses are combined into a **single `fq` parameter** with
` AND ` (e.g. `fq=institution_uid:in15 AND latitude:[-90 TO 90]`), the response is
returned **without the `Access-Control-Allow-Origin` header**. The HTTP status is
`200` and the body is correct, but a browser **blocks the response** because the
CORS header is absent, so `fetch()` rejects.

Sending the **same filters as separate `fq` parameters** (e.g.
`fq=institution_uid:in15&fq=latitude:[-90 TO 90]`) returns the response **with**
`access-control-allow-origin: *`, and the browser accepts it.

This is invisible to `curl`/server-side clients (they ignore CORS and see the
`200`), so it only manifests in browser apps — which made it very hard to diagnose.

## Impact

- Any browser-based client that AND-joins filters into one `fq` gets a response the
  browser discards. To the app it looks like a network failure / can appear as a
  generic `503` if a service worker substitutes one.
- This affects **filtered searches in general** (taxonomy, type status, collection,
  spatial bounding boxes), not just spatial queries.

## Reproduction

Both requests below return HTTP `200` with a correct JSON body. The difference is
only the response **headers**. Run with an `Origin` header to see the CORS header
(or lack of it).

**Header MISSING — single `fq`, AND-joined (fails in browsers):**

```bash
curl -s -D - -o /dev/null -H "Origin: https://example.org" \
  "https://biocache-ws.ala.org.au/ws/occurrences/search?q=*:*&fq=institution_uid:in15%20AND%20latitude:%5B-90%20TO%2090%5D%20AND%20longitude:%5B-180%20TO%20180%5D&pageSize=0" \
  | grep -i "access-control-allow-origin"
# (no output — header absent)
```

**Header PRESENT — separate `fq` params (works in browsers):**

```bash
curl -s -D - -o /dev/null -H "Origin: https://example.org" \
  "https://biocache-ws.ala.org.au/ws/occurrences/search?q=*:*&fq=institution_uid:in15&fq=latitude:%5B-90%20TO%2090%5D&fq=longitude:%5B-180%20TO%20180%5D&pageSize=0" \
  | grep -i "access-control-allow-origin"
# access-control-allow-origin: *
```

The behaviour is consistent on repeat (observed 10/10 for a given URL). It is not
specific to spatial fields — a non-spatial range shows it too, e.g.
`fq=institution_uid:in15 AND year:[2000 TO 2020]` (header missing) vs the same as
two separate `fq` params (header present).

## Expected vs actual

- **Expected:** `Access-Control-Allow-Origin` is returned consistently for all
  successful `/ws/occurrences/search` responses, regardless of how `fq` is structured.
- **Actual:** the header is omitted for some AND-joined single-`fq` requests.

This looks like a caching / gateway layer that adds CORS headers on one code path
but not another, rather than an intentional access rule (the status is `200` and
the data is returned in full).

## Workaround (client side)

Send each filter clause as its own `fq` parameter instead of joining them with
` AND ` in one parameter. Solr treats multiple `fq` params as an AND of filters, so
this is semantically identical and returns the CORS header reliably.

## Related observations (same service, same period — possibly the same infra change)

These may be intentional, but flagging in case they're side effects of the same work:

- `pageSize > 100` now returns **HTTP 503** (previously larger pages were allowed).
- The result window is capped at ~5000 (`startIndex + pageSize <= 5000`), and the
  previously-usable `id` field appears to no longer be returnable in `fl` or
  range-queryable, so the common `id:{lastId TO *}` cursor for deep paging no longer
  works. `cursorMark` does not return a `nextCursorMark`.

If a sanctioned deep-paging mechanism exists for browser clients, a pointer would be
very welcome.

---

Happy to provide more detail, HAR captures, or a minimal reproduction page. Thank you
for maintaining ALA — it underpins a lot of museum and citizen-science work.
