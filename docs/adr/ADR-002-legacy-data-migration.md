# ADR-002: Legacy data migration

**Status:** accepted

## Context

Production has v1 users whose jobs only have `createdBy`. In v2, `Job.organization` is required and every query filters on it, so an unmigrated job is simply invisible. On Vercel the migration runs in the build step: the previous deployment keeps serving until the new one is ready, and preview and production builds share the database.

## Decision

`001-orgs` only adds things: the Personal org, the owner membership, `job.organization` and `createdByName`. Nothing is removed, so v1 code keeps working on migrated data and the migration can run while v1 is still live.

It runs on **every** deploy, so idempotency isn't optional. A build can die halfway, and a preview and a production build can run at once:

- users who already have a membership are skipped;
- org and membership writes are upserts behind unique indexes (`personalOf`, `user + organization`), so even two overlapping runs can't create duplicates (tested);
- only jobs without an organization are updated.

For partial failures I chose a **repair pass** over one big transaction, which would be heavy on a free M0 cluster and still leave the question of what to do after an abort. Every step can be repeated, and the last step moves any job still lacking an organization to its author's Personal org. That covers the bad case: the membership was created, the process died before the jobs moved, and "skip users with a membership" would hide those jobs forever. Jobs whose author is gone are counted, not guessed.

As a safety net, the org middleware creates a missing Personal org on the fly.

## Consequences

Every deploy scans all users. Fine at this size; with many users I'd keep a ledger of finished migrations and make the repair pass its own command. The old `createdBy` indexes remain in Atlas and can be dropped later.
