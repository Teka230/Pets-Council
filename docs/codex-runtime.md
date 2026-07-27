# Codex runtime adapter

This document describes the first `codex app-server` integration slice.

## Scope

The current runtime proves only that Pets Council can:

1. resolve a Codex CLI binary;
2. start `codex app-server` over stdio;
3. exchange newline-delimited JSON messages;
4. complete the required initialization handshake;
5. expose connection state and failure details to the user;
6. stop the process explicitly.

It does **not** create or resume a thread, start a turn, stream model output, handle approvals, or inject a Council suggestion into Codex.

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

The JSONL decoder:

- accepts messages split across process chunks;
- accepts multiple messages in one chunk;
- rejects invalid JSON without echoing its payload into the error;
- keeps framing independent from protocol semantics.

## Initialization handshake

No app-server method may be used before initialization.

```text
Pets Council                         codex app-server
     |                                      |
     |  { id: 1, method: initialize }       |
     |------------------------------------->|
     |                                      |
     |  { id: 1, result: ... }              |
     |<-------------------------------------|
     |                                      |
     |  { method: initialized }             |
     |------------------------------------->|
     |                                      |
     |               ready                  |
```

The client identifies itself as:

```json
{
  "name": "pets_council",
  "title": "Pets Council",
  "version": "0.4.0"
}
```

Experimental capabilities are not enabled in this slice.

## Runtime states

```text
disconnected
     ↓ Connect Codex
connecting
     ├── initialize success → ready
     └── launch/protocol failure → error
ready
     ├── explicit Disconnect → disconnected
     └── unexpected process exit → error
error
     ↓ Retry connection
connecting
```

`ready` means only that the transport and handshake succeeded. The UI explicitly states that no thread has been created and no prompt has been sent.

## Trust boundary

- The process never starts automatically when the extension activates.
- Opening a workspace does not connect Codex.
- Connecting Codex does not create a conversation.
- No model request is made in this slice.
- No server-reported `codexHome` path is rendered in the panel.
- Stderr is bounded to a short diagnostic tail.
- Disconnect sends `SIGTERM` and follows with `SIGKILL` only when the process does not exit.

## Tests

The CI uses simulated transports rather than an authenticated Codex installation.

Tests cover:

- JSONL framing across chunks;
- multiple messages per chunk;
- invalid JSON handling;
- `initialize` then `initialized` ordering;
- protocol errors;
- notification routing;
- process-close propagation;
- binary-resolution precedence;
- connection, retry, error, and disconnect states;
- runtime rendering in both onboarding and active Council views.

## Next slice

The next runtime PR can build on this boundary to add:

```text
thread/start or thread/resume
        ↓
turn/start
        ↓
item and turn notifications
        ↓
completed assistant response
        ↓
real CouncilTurn
```

Approval requests must remain visible and require an explicit user decision.
