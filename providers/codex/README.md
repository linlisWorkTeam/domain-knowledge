# Optional Codex Provider

This package is only for the cloud demo. It is not installed by the company runtime.

```bash
npm install --prefix providers/codex
npm --prefix providers/codex run build
codex login
npm --prefix providers/codex run demo -- run --codex-agent doc-gen
```

The provider is injected through the core `configureRunners` seam. Authentication or quota
failures are explicit; the runtime never falls back silently between Codex and CodeAgent.
