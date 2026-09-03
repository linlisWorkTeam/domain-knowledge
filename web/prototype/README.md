# Knowledge Console UI/UX Prototype

This directory preserves the approved first-pass UI/UX design for the domain-knowledge product console.

## Included views

- Action Center: severity-ranked work queue, knowledge health, active flywheel run, and issue diagnosis drawer.
- Flywheel Runs: run metrics, execution history, and stage-level progress.
- Knowledge: domain navigation, generated/curated provenance, freshness, and health states.
- Graph Explorer: concept, source-symbol, and knowledge relationships with node details.
- Light and dark themes with system preference detection and persisted user choice.
- Responsive desktop and compact layouts.

## Preview

Serve this directory through any static HTTP server. For example:

```bash
cd web/prototype
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

The prototype uses static demonstration data. It intentionally does not replace the current `web/` implementation or connect to production APIs. Product behavior and backend integration should be handled in follow-up work after design review.
