# Pets Council Desktop Preview 0.1

The preview packaging flow produces **unsigned development archives**. It does not claim code signing, macOS notarization, Microsoft signing, store distribution, or automatic updates.

## Prepare branded sources

```bash
nvm use 24
npm install
npm run bootstrap
npm run package:preview:prepare
```

This builds and syncs the integrated extension, applies the native overlay, merges `config/product-preview.json` into the pinned Code - OSS `product.json`, and writes a reproducibility manifest under `artifacts/`.

## Build the current platform archive

```bash
npm run package:preview
```

Override the upstream packaging target when needed:

```bash
npm run package:preview -- --target darwin-x64
npm run package:preview -- --target linux-x64
npm run package:preview -- --target win32-x64
```

The manual **Desktop Preview packages** workflow runs the same process on Linux, macOS, and Windows.

## Release gate

Before sharing an archive:

- normal extension CI is green;
- the full Code - OSS compile smoke is green;
- product name and application identifiers match `config/product-preview.json`;
- the integrated extension entrypoint exists in the packaged application;
- onboarding and diagnostics open successfully;
- a real authenticated Codex turn completes;
- the Council produces zero to two suggestions per role;
- drag, reset, reduced motion, approvals, interruption, and session resume are manually checked;
- the archive manifest says `signed: false` and `notarized: false` until those processes are genuinely implemented.

## Later signing work

Signing and notarization require platform credentials and protected CI secrets. Those are intentionally outside Preview 0.1. A signed release must use a new version and update the archive manifest truthfully.
