# P1 logout navigation

November 4, 2026 (Asia/Seoul). Automated implementation; browser visual QA is pending.
Deployment rehearsal remains paused. Frontend starting HEAD: `fd8afbfd87cab738a92d354cf97067f16b4cd2a0`.

## Cause and sequences

The actual Admin profile route is `/_admin/profile`. Its profile form and the Admin
shell both call `libs/auth/index.ts`'s shared `logOut`. The original Nestar helper
also cleared identity and reloaded; GymFlow added secure session/cache cleanup.

Previously: mark persistent logout pending and signal other tabs; synchronously
increment auth generation, clear memory access token/session ID and reactive user;
await Apollo `clearStore`; await cookie-authorized `logoutSession` under the native
auth lock; remove pending flag; perform `window.location.replace('/')` for USER or
explicit public redirects, otherwise reload. Until that final browser navigation,
the Admin layout remained mounted with `authReady=true` and an empty user. Its
correct ACTIVE ADMIN guard therefore rendered the unauthorized fallback.

Now: publish shared `logoutInProgressVar` before invalidation; the `_app` boundary
unmounts the page and shows the existing localized logout status; immediately clear
identity/credentials and fence old responses; await cache cleanup and server
revocation; remove persistent pending flag; await Next Pages Router `replace('/')`;
release the transition and mount anonymous Home. No timeout, CSS suppression,
stale-auth retention, or full-page navigation is used.

The boundary covers every logout entry point and role, including password-change
logout. Role guards and backend contracts are unchanged. The existing optional
`redirectToPublic` argument remains callable; all roles now return to Home.
Replacing the current history entry avoids pushing the just-signed-out page onto
history. Earlier protected history entries still require authorization; they are
not erased and cannot restore authenticated content after logout.

## Cleanup and failures

- Memory token/session, reactive profile, legacy token storage, generation fencing,
  cross-tab signal, Apollo cleanup, credentialed/preflight logout request, refresh
  cookie revocation, and native locking retain their existing mechanisms.
- Repeated clicks cannot start another logout while the transition is active.
- Server failure returns false, leaves the persistent pending flag, clears local
  credentials, and releases the transition. Existing focus/bootstrap recovery can
  retry revocation; token refresh stays blocked while pending. No success is claimed.
- Cache failure still attempts server revocation, then returns false with the
  existing reload-required error. It does not navigate or expose a private page.
- Router rejection or cancellation returns false with a signed-out navigation
  error and releases the transition. Protected guards deny access; the user may
  navigate to `/` manually. A stale operation cannot replace a newer auth error.
- `finally` releases the transient UI state for all settled outcomes. The persistent
  pending flag is separate and retains its security/recovery meaning.

## Files

- `apollo/store.ts`: transient shared logout state.
- `libs/auth/index.ts`: state ownership, existing cleanup and awaited Home replacement.
- `libs/components/auth/LogoutTransition.tsx`, `pages/_app.tsx`: shared page boundary.
- `scripts/test-logout-navigation.cjs`: mounted real App/Admin guard and logout handler;
  controlled member guards, cache/server/router promises, every committed frame,
  cleanup, repeated actions, history/deep-link checks and failure cases. No network.
- `scripts/test-auth.cjs`, `test-auth-session.cjs`, `test-user-profile.cjs`,
  `test-trainer-profile.cjs`: router doubles and current Home behavior. Existing
  menu expectations now include the already-present Gym Access item; no menu or
  business implementation changed. Trainer post-logout account switching waits for
  the current React commit instead of accepting an earlier redirect receipt.
- This note records completion separately because the backend completion log is protected.

## Automated validation

| Command | Result |
| --- | --- |
| `yarn node scripts/test-logout-navigation.cjs` | 8 passed; no denied/private frame during successful logout |
| `yarn node scripts/test-auth.cjs --integration` | 25 passed |
| `yarn node scripts/test-auth-session.cjs` | 18 passed, including real session revocation and obsolete-response fencing |
| `yarn node scripts/test-admin-workspace.cjs` | 10 passed |
| `yarn node scripts/test-user-profile.cjs --integration` | 24 passed |
| `yarn node scripts/test-trainer-profile.cjs --integration` | 14 passed |
| `yarn typecheck` | Passed on final source |
| Scoped `yarn lint --no-cache --file ...` for the four changed application files | Passed |
| Isolated `yarn build` | Passed on final source, 105 pages; existing warnings only |
| `yarn test:migration` | Pre-existing failure: source-text regex requires `inputProps` to be the first Admin `OutlinedInput` prop. Assertion and Admin source are unchanged from starting HEAD. Left untouched. |

GraphQL documents/schema are unchanged. Real isolated auth integration exercises
the existing logout contract; no application-schema request was needed. Integration
writes use only owned disposable loopback test databases and temporary upload roots.
No production or `GymFlow_dev` access/mutation was performed. The build copies source
into an owned OS temporary directory, uses its own `.next`, copies no `.env` files,
and supplies reserved example API URLs. Existing development servers are untouched.
Inherited image/font, workspace-lockfile, CSS, i18next and large-page-data warnings
remain outside this fix.

## Preservation and manual QA

Before/after SHA-256 values are identical:

- Frontend `public/locales/en/common.json`:
  `C57B28C4F5AF88E38688F1BFE3289710EEDA2E387C0F50E1A060BEBFD771502A`.
- Backend `docs/ai/COMPLETED_TASKS.md`:
  `A3800B213F112364D305C8FB4421E2994429C3A5BE05A529E49FBD3DDED5319F`.

All 19 deployment candidate files plus the backend deployment test retain their
baseline hashes. They and the two protected modifications remain unstaged and
uncommitted. No backend source, deployment work, business rules, push or deployment
is part of this change. The logout commit contains only the files listed above.

Use the local development frontend and existing QA accounts. Test both desktop and
a narrow/mobile viewport; repeat logout with slow Network throttling if useful.

1. ADMIN: sign in, open `/_admin/profile`, click profile Logout and confirm. Verify
   logout status followed by Home, with no administrator-required/Sign in flash.
   Repeat from another Admin page using the sidebar Log out button.
2. USER: sign in, open `/mypage?category=myProfile`, Logout and confirm. Verify Home
   and the guest Login/Register header, with no private-access fallback flash.
3. TRAINER: sign in, open `/mypage?category=myProfile`, Logout and confirm. Verify
   Home without trainer/private-access fallback or retained workspace content.
4. For each role, press Back. No authenticated content may return; an older protected
   entry may show its normal authorization gate. Reload and verify the session stays
   signed out. While anonymous, directly open `/_admin/profile` and verify denial.
5. Optional failure check: go offline immediately before logout. Confirm private
   content disappears and the status settles to a signed-out/error gate. Restore
   network and focus/reload so existing pending-revocation recovery runs; verify
   signed-out state persists. A server failure must never appear as logout success.

These are pending human checks; automated DOM/router tests do not establish visual PASS.
