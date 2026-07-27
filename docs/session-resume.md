# Codex session persistence and resume

Pets Council remembers the most recently selected Codex thread for each workspace and can explicitly rejoin it through `thread/resume`.

## Stored locally

The extension stores only:

```text
thread id
saved timestamp
```

The data is written to VS Code `workspaceState`. Pets Council does not duplicate prompts, assistant responses, command output, or file contents in its own session record.

## Workspace scope

The storage key is derived from the sorted workspace-folder URIs. Multi-root workspaces therefore receive a stable key independent of folder ordering.

No workspace uses the isolated fallback key `no-workspace`.

## Explicit lifecycle

```text
Saved thread discovered locally
        ↓
Connect Codex
        ↓
Handshake complete
        ↓ explicit click
Resume saved session
        ↓
thread/resume
  ├── threadId
  ├── current cwd when available
  └── approvalsReviewer: user
        ↓
Thread ready
```

Neither connection nor resume happens automatically.

The user may choose **Start new session** instead. The new thread then becomes the workspace's next saved session.

## Restored conversation

The `thread/resume` response contains the thread history. Pets Council extracts only the latest completed turn that contains:

- a text user message;
- a final agent message.

That exchange is restored into the primary-assistant view and becomes eligible for the same Council bridge as a newly completed turn.

Incomplete turns, image-only inputs, tool-only history, and exchanges without a final agent message are not fabricated into a restored conversation.

## Trust boundary

- The saved thread id is local and inspectable through VS Code workspace storage.
- Resume is always user-triggered.
- Approval review remains routed to the user after resume.
- The restored history comes from Codex app-server, not from an unverified local transcript copy.
- The current workspace and Git context are freshly captured before the Council reviews the restored exchange.
- Disconnecting keeps the saved-session offer but clears the active process, thread, approval, and turn state.
