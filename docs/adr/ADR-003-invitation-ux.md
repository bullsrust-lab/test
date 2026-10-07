# ADR-003: Invitation UX for new vs. existing users

**Status:** accepted

## Context

An owner invites by email, often before that person has an account. One endpoint (`POST /invitations/:token/accept`) has to handle someone who already uses JobTrail, someone who doesn't, and someone who opens the link while signed in as somebody else.

## Decision

Before anyone types, the `/invite/:token` page calls `GET /invitations/:token` (org, role, inviter, `hasAccount`) and shows exactly one thing:

- **signed in, matching email:** one "Join" button;
- **signed in as someone else:** the API answers 403, the page offers to log out;
- **no account:** set a password, name optional. Account, Personal workspace, membership and the used-up link are written in **one transaction**, so nobody ends up with an account but no team, or a dead link but no account;
- **account exists, not signed in:** 409; the page shows a login form with the email fixed, then accepts with the new session.

The alternative was one form for everyone: in the anonymous flow, treat the password as a login when the account exists. Rejected: the same field would mean "create" for some people and "prove" for others, a typo would look like a broken invite, and the accept endpoint would become a second login that needs its own brute-force protection.

The API returns the token and a full `inviteUrl`. Owners share the URL (there's no mailer yet); the token is for API clients and tests. Only a SHA-256 of the token is stored, so a database dump can't be used to join a team. Links are single-use, last 7 days, and re-inviting cancels the old one.

## Consequences

`hasAccount` tells the link holder whether the address is registered. That's acceptable because the link was sent to that address. Personal workspaces can't be shared (400), so "Personal" still means "only you". Without email delivery, owners pass links on themselves.
