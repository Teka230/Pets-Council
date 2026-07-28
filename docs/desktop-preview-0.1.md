# Pets Council Desktop Preview 0.1

## Artifact contract

The manual **Desktop Preview artifacts** workflow builds the pinned, patched Code - OSS source tree on:

- Linux x64;
- macOS arm64;
- Windows x64.

For each target it uploads:

```text
Pets-Council-Desktop-Preview-<version>-<target>.tar.gz
Pets-Council-Desktop-Preview-<version>-<target>.manifest.json
Pets-Council-Desktop-Preview-<version>-<target>.sha256
```

The packaging script refuses an output that does not contain the integrated `pets-council/dist/extension.js` entrypoint or a packaged `product.json`.

## Trust statement

Preview 0.1 artifacts are deliberately marked:

```json
{
  "signed": false,
  "notarized": false
}
```

They are development previews, not trusted production installers. Signing, Apple notarization, installer generation, and update-channel publishing remain separate release gates.

## Manual smoke checklist

For each target:

1. extract the archive on a clean machine or disposable VM;
2. launch the packaged application;
3. open a workspace;
4. apply the Pets Council product layout;
5. connect an installed and authenticated Codex CLI;
6. verify the model and effort selectors;
7. create a session and complete at least three turns;
8. confirm the timeline and turn-attached Council reviews;
9. browse, rename locally, resume, and archive a session;
10. exercise Allow once, Deny, and Stop;
11. close and reopen the application;
12. verify that the saved thread is offered but never resumed automatically.

Record the OS version, architecture, artifact checksum, Codex CLI version, pass/fail result, and any visual defect.

## Promotion gate

A Preview artifact can be promoted only after:

- its SHA-256 matches the uploaded checksum file;
- the full manual smoke checklist passes;
- no blocking crash occurs in the primary conversation loop;
- release notes list known limitations;
- the absence or presence of signing is stated accurately.
