# Native workbench overlay

The native layer exists only because a normal extension webview cannot place companions above editor, terminal, and sidebar surfaces.

## Files

```text
native/code-oss/src/vs/workbench/contrib/petsCouncil/browser/petsCouncilOverlay.ts
native/code-oss/src/vs/workbench/contrib/petsCouncil/browser/petsCouncil.contribution.ts
native/code-oss/src/vs/workbench/contrib/petsCouncil/browser/media/petsCouncilOverlay.css
```

`npm run native:apply` copies these files into the pinned Code - OSS checkout and inserts one import into `workbench.common.main.ts`. The operation is idempotent.

## Bridge payload

Only visual snapshots cross the boundary:

```ts
type PetSnapshot = {
  role: string;
  petId: string;
  name: string;
  glyph: string;
  state: 'idle' | 'thinking' | 'suggestion' | 'silent' | 'approval' | 'error';
  suggestionCount: number;
};
```

No prompts, assistant messages, selected code, credentials, commands, or permissions are sent to the native overlay.
