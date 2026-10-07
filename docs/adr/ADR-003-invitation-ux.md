# ADR-003: Invitation UX for new vs. existing users

**Status:** accepted

## Context

An owner invites by email, often before that person has an account. One endpoint (`POST /invitations/:token/accept`) has to handle someone who already uses JobTrail, someone who doesn't, and someone who opens the link while signed in as somebody else.

## Decision

The `/invite/:token` page reads `GET /invitations/:token` (org, role, inviter, email) and shows one form:

- **signed in, matching email:** one "Join" button;
- **signed in as someone else:** the API answers 403, the page offers to log out;
- **not signed in:** "set a password" by default, with a "Log in instead" link. Account, Personal workspace, membership and the used-up link are written in **one transaction**, so nobody ends up with an account but no team. If the address is already registered, the API answers 409 and the page switches to login with the email fixed.

The alternative was one form for everyone: treat the password as a login when the account exists. Rejected: the same field would mean "create" for some people and "prove" for others, a typo would look like a broken invite, and the accept endpoint would become a second login needing its own brute-force protection.

An earlier version returned `hasAccount` in the preview to pick the form up front. Dropped: an unauthenticated GET shouldn't say who is registered.

The API returns the token and a full `inviteUrl`, since there's no mailer yet. Only a SHA-256 of the token is stored. Links are single-use, last 7 days, and re-inviting cancels the old one.

## Consequences

Existing users may hit a 409 before the login form. That 409 still reveals the address is registered, but only on a rate-limited POST with a valid link made for that address. Personal workspaces can't be shared. Owners pass links on themselves.
