# QM Collections Explorer

A browser-based interface for exploring the Queensland Museum's natural history collections. Single HTML file, no build step, no server — open it and search.

Live data from the [Atlas of Living Australia](https://www.ala.org.au/) (ALA) via its public biocache API, enriched with species information from GBIF, Wikipedia, iNaturalist, and Queensland Government spatial services.

## What it does

- **Search** 900,000+ specimen records by common name, scientific name, catalog number, or free text
- **Filter** by taxonomy (kingdom → species), collection, type status, media, georeferencing, country, state
- **Browse** visual taxonomy cards with images and common names at any rank level
- **Map** georeferenced specimens with marker clustering, colour-coded by collection, with polygon spatial filtering via NNTT Indigenous estate boundaries
- **Analyse** collection composition through interactive charts (taxonomic breakdown, quality metrics, temporal distribution)
- **View** full specimen detail with multi-image gallery, spatial context (bioregion, LGA, vegetation, marine zones, bathymetry, traditional owner groups), and Wikipedia descriptions
- **Export** filtered results as CSV, or as an enriched CSV that includes spatial context for each record

The five views in the interface are labelled **Records, Taxa, Browse, Map, Analytics**.

## Architecture

### Single-file design

`index.html` is a self-contained ~340 KB file, around 6,200 lines. All CSS, JavaScript, and HTML live in one document. External dependencies are loaded via CDN:

- [Leaflet](https://leafletjs.com/) 1.9.4 — mapping
- [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) 1.5.3 — marker clustering
- [Barlow](https://fonts.google.com/specimen/Barlow) — typeface (Google Fonts)

No framework, no build tools, no package manager. The file can be deployed to GitHub Pages, opened locally, or embedded in any static hosting environment without configuration.

### Data sources

| Service | Purpose | Base URL |
|---|---|---|
| ALA Biocache | Specimen records, facets, occurrence detail | `biocache-ws.ala.org.au/ws/occurrences/search` |
| ALA BIE | Species profiles, taxonomy matching | `bie-ws.ala.org.au/ws/search` |
| ALA Spatial Intersect | IBRA bioregion, IMCRA marine region, state, elevation | `spatial.ala.org.au/ws/intersect` (layers `cl1048,cl1049,cl10923,el887`) |
| GBIF Species API | Common name resolution, taxonomic matching, parent hierarchy | `api.gbif.org/v1/species` |
| iNaturalist Taxa API | Common name fallback, taxon detail | `api.inaturalist.org/v1/taxa` |
| Wikipedia REST + MediaWiki API | Species descriptions and images | `en.wikipedia.org/api/rest_v1`, `en.wikipedia.org/w/api.php` |
| QLD AdminBoundaries MapServer | LGA, bioregion spatial enrichment | `spatial-gis.information.qld.gov.au/.../AdminBoundariesFramework` |
| QLD VegetationManagement MapServer | Broad vegetation groups | `spatial-gis.information.qld.gov.au/.../VegetationManagement` |
| QLD ParksMarineProtectedAreas MapServer | Marine park zones, fish habitat areas, benthic habitat | `spatial-gis.information.qld.gov.au/.../ParksMarineProtectedAreas` |
| GA Bathymetry MapServer | Ocean depth at specimen coordinates | `services.ga.gov.au/.../Bathymetry_Topography` |
| NNTT Custodial FeatureServer | Native title determination boundaries | `services2.arcgis.com/.../NNTT_Custodial_AGOL` |
| Nominatim (OSM) | Reverse geocoding for locality context | `nominatim.openstreetmap.org` |

### Institution scope

All ALA queries are scoped to Queensland Museum via the institution UID `in15` (`institution_uid:in15`). This is set in the `S.alaInst` state variable and applied as a base filter query on every ALA request.

### Key internal patterns

**State object (`S`)**: All application state lives in a single mutable object. Key fields include `res` (current page records), `total` (result count), `view` (active tab), `mapPoly` (polygon geometry), `_polyMasterRecs` (master cache for polygon filtering).

**Polygon mode**: When a user draws or selects a spatial area, the app fetches every record in the polygon's bounding box once and caches it client-side. Subsequent filter changes (taxonomy, type status, media, etc.) operate on the cache via `clientFilterRecs()` rather than re-hitting the API. Dropdown facet counts are recomputed client-side via `computePolyDropdownFacets()` using a "relax self" approach — each dropdown's counts reflect all other active filters.

**Spatial enrichment**: Runs lazily when a specimen modal is opened. Parallel ArcGIS `query` and `identify` calls to QLD Government and Geoscience Australia services. Results cached on the record object (`r._spatial`). Marine enrichment gated by `isMarine(r)` which checks collection membership and coordinate range.

**URL state**: Filter state, active view tab, and sort order are encoded in the URL hash. Links are shareable and bookmarkable. Browser back/forward navigation is supported via `hashchange` listener.

## Accessibility

Targets WCAG 2.1 AA compliance:

- Landmark roles (`banner`, `main`, `complementary`, `search`, `dialog`)
- WAI-ARIA tab pattern with arrow key navigation
- All form controls have explicit `<label for>` or `aria-label`
- Modal focus trap with focus restore on close
- Skip-to-content link
- `aria-live` regions for dynamic content updates (filter chips, record count, toast notifications)
- `aria-expanded` / `aria-pressed` on toggle controls
- Minimum 44×44px touch targets on all interactive elements
- `:focus-visible` styles throughout

**Keyboard shortcuts:**

- `[` — Toggle filter sidebar
- `Escape` — Close specimen modal
- `↑` / `↓` — Navigate between specimens in modal
- `←` / `→` / `Home` / `End` — Navigate between view tabs

## Deployment

### GitHub Pages

1. Place `index.html` in a repository
2. Place `sw.js` in the same directory (optional — the app runs without it)
3. Enable GitHub Pages in repository settings (source: root of `main` branch)
4. The app will be available at `https://<username>.github.io/<repo>/`

### Local

Open `index.html` in any modern browser. No server required — all API calls are to public CORS-enabled endpoints.

If `sw.js` is not present alongside `index.html`, the app runs in standalone mode without service worker caching. The registration call fails silently.

### Requirements

- Modern browser (Chrome 90+, Firefox 88+, Safari 15+, Edge 90+)
- Internet connection (all data is fetched live from external APIs)

### Caching

The app uses two caching layers, which sit on top of the browser's standard HTTP cache:

**In-page cache (`cachedFetch` in `index.html`)**: A JavaScript Map holding up to 400 API responses for 30 minutes, scoped to ALA biocache, ALA BIE, ALA spatial intersect, GBIF, iNaturalist, and Wikipedia. Lives for the duration of a single page session. Reduces redundant API calls while a user is exploring.

**Service worker (`sw.js`, optional)**: When deployed alongside `index.html`, persists caching across page reloads and sessions:

| Category | Strategy | TTL | Max entries |
|---|---|---|---|
| CDN assets (Leaflet, fonts) | Cache-first | Indefinite (versioned URLs) | — |
| Map tiles (OSM, OpenTopoMap) | Cache-first with TTL | 24 hours | 600 |
| Specimen images (ALA) | Cache-first with TTL | 24 hours | 600 |
| API responses (ALA, GBIF, Wikipedia, iNaturalist) | Stale-while-revalidate | 1 hour | 500 |

QLD Government spatial services, NNTT, Geoscience Australia, and Nominatim are deliberately not cached — their responses are location-specific and the services have intermittent availability that caching would obscure.

The service worker is also the foundation for a future offline mode (Service Worker + IndexedDB), which would let users browse previously-loaded records without an internet connection — useful for fieldwork at remote sites.

If `sw.js` is not present, the app runs in standalone mode. The registration call fails silently and the in-page cache continues to handle within-session requests.

To force a cache refresh, increment the version suffix in the cache names (`CACHE_STATIC`, `CACHE_API`, `CACHE_IMG`) in `sw.js`. The activate event automatically purges old caches.

## Known limitations

- **QLD spatial services**: The QLD Government ArcGIS MapServer services (`spatial-gis.information.qld.gov.au`) intermittently return 503 errors. The app shows a graceful degradation message when these services are unavailable. A bug report has been filed with QLD Spatial Help Centre.
- **Polygon geometry not in URL**: NNTT polygon geometries are too large for URL encoding. Only the area name is stored — polygon state cannot be fully restored from a shared link.
- **No offline mode yet**: All data requires live API access. The service worker is in place as the foundation for offline browsing — a future Service Worker + IndexedDB implementation would let users browse previously-loaded records without an internet connection.

## Credits

Built by Lily Kumpe. Data from the Atlas of Living Australia, GBIF, Wikipedia, iNaturalist, Queensland Government spatial services, Geoscience Australia, and the National Native Title Tribunal.

## Licence

Copyright © 2026 Lily Kumpe

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for the full text, or read it at <https://www.apache.org/licenses/LICENSE-2.0>.

You may use, modify, and redistribute this code under the terms of the licence. Attribution to the original author is required, and any modifications must be noted.
