# Shared Context Graph

The Shared Context Graph is the durable project memory. Codex, the Council, pets, tools, and humans are actors that receive projections; none of them owns the context.

## Storage

- `.filrouge/council/shared-context-graph.json` when `.filrouge/` exists;
- `.pets-council/shared-context-graph.json` otherwise.

The document is bounded to 500 nodes and 1,000 relations in this first implementation.

## Explicit writes

Opening the panel or refreshing context performs bounded reads only. A write occurs only after **Save to graph** on a specific Council proposal.

## Projection

The projector combines recent durable graph nodes with optional known sources. The result is capped before it is sent to a Council review. Absolute workspace paths are not rendered in the UI.
