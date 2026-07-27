# Full Code - OSS desktop smoke

This is the release-gate scenario for the patched Pets Council workbench. It verifies the complete distribution boundary rather than only compiling the extension in isolation.

## Automated compile gate

```bash
npm install
npm run bootstrap
npm run desktop:smoke
```

The command:

1. builds the integrated extension;
2. syncs its compiled `dist/` output into Code - OSS;
3. applies the native overlay contribution idempotently;
4. installs Code - OSS dependencies;
5. runs the full upstream compile;
6. verifies the extension entrypoint, workbench contribution, and compiled workbench output.

A manual GitHub Actions workflow named **Desktop smoke** provides the same compile gate without making every normal pull request pay the Code - OSS build cost.

## Interactive desktop scenario

```bash
npm run desktop:launch
```

Then verify:

1. the patched Code - OSS desktop window opens;
2. **Pets Council: Open Council** is available from the command palette;
3. the global companion overlay is visible;
4. opening a project refreshes editor and Git context;
5. connecting Codex remains explicit;
6. a completed Codex turn is reviewed by the Council;
7. companion states change for thinking, suggestions, approvals, and errors;
8. clicking a companion opens the Council panel;
9. reduced-motion mode disables non-essential animation;
10. no suggestion, approval, command, or file modification runs without an explicit user action.

## Evidence

A release candidate should attach at least one screenshot or short capture showing:

- the desktop workbench;
- the Council panel with a completed Codex exchange;
- the native companion overlay;
- one companion in suggestion or approval state.

## Platform notes

The source and extension checks run on every pull request. The heavyweight desktop compile is manual because upstream Code - OSS dependency installation and compilation are substantially larger.

The compile workflow currently runs on Linux. Local launch remains the authoritative check for macOS and Windows window integration, signing, and platform-specific rendering.
