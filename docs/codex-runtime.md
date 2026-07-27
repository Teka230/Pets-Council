# Codex runtime adapter

This document describes the current `codex app-server` integration boundary.

## Scope

Pets Council can now:

1. resolve a Codex CLI binary;
2. start `codex app-server` over stdio;
3. exchange newline-delimited JSON messages;
4. complete the required initialization handshake;
5. explicitly create a workspace-scoped thread;
6. expose connection and thread state to the user;
7. stop the process explicitly.

It does **not** start a turn, send a prompt, stream model output, handle approvals, or inject a Council suggestion into Codex yet.

## Process launch

The runtime starts:

```text
codex app-server --listen stdio://
```

The binary is resolved in this order:

```text
petsCouncil.codexBinary
        ↓
CODEX_BIN
        ↓
codex on PATH
```

Changing the configured binary disconnects the existing process. Reconnection remains an explicit user action.

## Transport

The stdio transport uses one JSON object per line:

```text
stdin  ← requests and notifications from Pets Council
stdout → responses, requests, and notifications from app-server
stderr → bounded diagnostic tail only
```

The JSONL decoder accepts split and batched messages while keeping framing separate from protocol semantics.

## Initialization handshake

No app-server method may be used before initialization.

```text
Pets Council                         codex app-server
     |                                      |
     |  { id: 1, method: initialize }       |
     |------------------------------------->|
     |  { id: 1, result: ... }              |
     |<-------------------------------------|
     |  { method: initialized }             |
     |------------------------------------->|
     |               ready                  |
```

The client identifies itself as `pets_council` version `0.5.0`. Experimental capabilities are not enabled.

## Thread creation

A thread is created only after the user presses **Start Codex session** or **New Codex session**.

```text
Handshake complete
        ↓ explicit user action
thread/start
  ├── cwd: active workspace folder when available
  └── approvalsReviewer: user
        ↓
Thread ready
```

The response is reduced to an inspectable local summary containing the thread id, session id, workspace, model, model provider, approval policy, and approval reviewer when present.

Creating a thread does not trigger model generation. The panel explicitly states that no turn has been started and no prompt has been sent.

## Runtime states

```text
disconnected
     ↓ Connect Codex
connecting
     ├── initialize success → ready / no thread
     └── launch or protocol failure → error
ready / no thread
     ↓ Start Codex session
thread starting
     ├── thread/start success → thread ready
     └── protocol failure → thread error
thread ready
     ├── New Codex session → thread starting
     ├── Disconnect → disconnected
     └── unexpected process exit → connection error
```

## Trust boundary

- The process never starts automatically when the extension activates.
- Opening a workspace does not connect Codex.
- Connecting Codex does not create a thread.
- Creating a thread does not start a turn or send a prompt.
- Approval review is explicitly routed to the user for the thread.
- No model request is made in this slice.
- No server-reported `codexHome` path is rendered in the panel.
- Stderr is bounded to a short diagnostic tail.
- Disconnect sends `SIGTERM` and follows with `SIGKILL` only when necessary.

## Tests

CI uses simulated transports rather than an authenticated Codex installation.

Tests cover JSONL framing, handshake ordering, protocol errors, notifications, process exits, binary resolution, thread request shape, thread response parsing, duplicate lifecycle protection, disconnect cleanup, and UI rendering.

## Next slice

```text
Thread ready
        ↓
turn/start with explicit text input
        ↓
item/agentMessage/delta
        ↓
turn/completed
        ↓
completed assistant response
```

Approval requests must remain visible and require an explicit user decision before any approval-capable production flow is enabled.
