# Realtime Consensus Model for Karaoke Queue

## Summary
Karaoke Queue does **not** need distributed consensus (Raft/Paxos) because each room is
already a single, authoritative Durable Object (DO) with strongly consistent storage and a
single-threaded execution model. Instead, the right model is **authoritative server state**
with **versioned snapshots**, **idempotent commands**, and **client reconciliation** over
WebSockets, with HTTP as a fallback.

## Terminology: Consensus vs Realtime Convergence
- **Distributed consensus** (e.g., Raft) replicates a state machine across multiple servers
  using a leader and a replicated log. It is for **multi-node replication** and leader failover.
  [Raft overview](https://en.wikipedia.org/wiki/Raft_(algorithm))
- **Realtime convergence** for collaborative apps is often addressed by:
  - **Operational Transformation (OT)**, originally described in “Concurrency Control in
    Groupware Systems.” OT is designed for concurrent, low-latency edits with convergence
    and intention preservation.  
    [Ellis & Gibbs, 1989 PDF](https://www.lri.fr/~mbl/ENS/CSCW/2012/papers/Ellis-SIGMOD89.pdf)
  - **CRDTs**, which provide **Strong Eventual Consistency** under concurrent updates by
    ensuring commutative/monotonic merges.  
    [CRDT paper (Shapiro et al.) PDF](https://www.lip6.fr/Marc.Shapiro/papers/2011/CRDTs_SSS-2011.pdf)

These models are useful **when multiple authoritative replicas accept concurrent writes** or
when offline edits must later merge safely.

## What Durable Objects Already Provide
Cloudflare Durable Objects give the exact semantics we need for a **single-authority room**:
- **Global uniqueness**: only one instance of a given DO ID is active worldwide, so a
  room has a single authoritative “leader.”  
  [Workers storage options](https://developers.cloudflare.com/workers/platform/storage-options/)
- **Strongly consistent, transactional storage** per DO instance.  
  [Workers storage options](https://developers.cloudflare.com/workers/platform/storage-options/)
- **Single-threaded execution**, but note that **request events may be processed out of
  order** from arrival.  
  [Workers storage options](https://developers.cloudflare.com/workers/platform/storage-options/)
- DOs are explicitly recommended for coordinated, realtime shared state.  
  [Rules of Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)

## Implication for Karaoke Queue (Inference)
Because each room is a single authoritative DO instance with strongly consistent storage,
we can model the system as a **single-leader state machine** and avoid multi-leader
consensus algorithms. This reduces complexity while still giving strong correctness for
queue ordering and vote counts.  
(Inference based on DO guarantees above.)

## Candidate Models (What We Considered)
### 1) Authoritative DO + Versioned Snapshots (Recommended)
**Model**
- All writes go through the RoomDO (single authority).
- DO broadcasts **full or partial state snapshots** to clients over WebSockets.
- Clients reconcile by applying the **latest state version** they have seen.

**Why it fits**
- DO is a single leader already, so no replica consensus is required.
- Strong consistency means you can safely serialize queue updates without conflicts.
- Out-of-order event processing implies you should prefer **idempotent commands** and
  **versioned snapshots** to protect clients from stale updates.

### 2) CRDTs (Not needed today)
**Model**
- Multiple replicas accept local writes and later merge using CRDT algebra.

**Why not now**
- You do not have multi-authority writers; the DO is already the single writer.
- CRDTs shine with offline multi-master edits, which is outside the current scope.

### 3) Operational Transformation (Not needed today)
**Model**
- Transform concurrent edits so that all replicas converge with preserved intent.

**Why not now**
- OT is optimized for collaborative text editing with concurrent writes on many replicas.
- Your queue updates are serialized in the DO, so OT adds complexity without benefit.

### 4) Distributed Consensus (Raft/Paxos)
**Model**
- Replicated state machine across servers with leader election and log replication.

**Why not now**
- DO already provides a global singleton per room, so Raft-style replication is redundant.

## Recommended Design Details
### 1) State Versioning
Add a monotonic `stateVersion` in RoomDO:
- Increment on every successful mutation.
- Include in all WS `state` messages.
- Clients only apply states with a higher version than their current one.

This directly mitigates out-of-order delivery from the DO or network.

### 2) Idempotency Keys
Clients send `requestId` with mutating actions (join, vote, remove, reorder).
RoomDO keeps a short-lived map of processed IDs:
- If a request is retried, return the original result.
- Prevents double-apply under retries or flaky networks.

### 3) Expected Version (Optimistic Concurrency)
For sensitive actions (e.g., `next`/`skip`, reorder):
- Client sends `expectedVersion`.
- DO rejects if it doesn’t match and returns the latest state.
- Prevents applying stale commands.

### 4) Snapshot + Delta Strategy (Optional)
If bandwidth is a concern:
- Send deltas for routine updates (vote count changes).
- Periodically send full snapshots (e.g., every N updates or every M seconds).

## When to Revisit This Model
Consider CRDTs or multi-leader replication **only if**:
- You introduce offline-first editing where clients can queue songs without connectivity.
- Multiple data centers or replicas accept writes without a single DO authority.

Until then, the authoritative DO model is the simplest and most robust fit.
