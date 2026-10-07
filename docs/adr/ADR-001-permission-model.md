# ADR-001: Permission model

**Status:** accepted

## Context

In v1 the only question was "is this job yours?": `checkPermission` compared `job.createdBy` with the user from the token. v2 has a shared pipeline. Two recruiters must be able to work on the same jobs, and a hiring manager should see them without being able to change anything. The same person can be in several organizations, with a different role in each.

## Decision

Three roles, stored on the `Membership` (per organization, not per user): `owner`, `recruiter`, `viewer`.

They match the three kinds of people in the brief: one who runs the team, people who work the pipeline, people who watch it. Two roles ("admin/member") would force the hiring manager to either edit or see nothing. More roles (edit-own vs edit-all, billing admin, ...) have no user story yet, and every role multiplies the write × role test matrix.

Permission is two checks that answer different questions:

1. **`requireRole('owner', 'recruiter')` on the route**: may your role in the *active* org write here at all? A viewer stops here with 403.
2. **`checkPermission(org, job)` on the resource** (the v1 function, rewritten): does this job belong to the org you're acting in? If not, 404, the same answer as for a job that doesn't exist, so ids from other teams can't be probed.

`createdBy` no longer grants or denies anything. It's an audit field, shown as `createdByName`.

## Consequences

- A recruiter can edit a job another recruiter added. That's the point of a shared pipeline. If an agency ever wants "only your own", it's an extra rule inside `checkPermission`, not a new role.
- The role always comes from the active org: the same user writes in their Personal workspace and is read-only in a team where they're a viewer (tested).
- The demo account stays read-only through a separate flag, whatever role it has.
