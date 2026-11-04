# Logout transition follow-up

November 4, 2026 (Asia/Seoul). Parent commit: `5ea1df4a94b2c3d9ab7808e6429eacd93e629a83`.
The user confirmed the unauthorized Admin flash is gone, but did not pass P1 because
the blank logout status sometimes lasts several seconds. This follow-up preserves
that security fix. Human visual QA is still required.

## Development measurements

Measured the actual development frontend at `http://localhost:3000`, starting on
`/_admin/gym-access` and using its actual sidebar logout handler, shared auth code,
Apollo cache and Next Pages Router. A fresh headless Edge context intercepted every
GraphQL request and forwarded it exclusively to an owned disposable Nest/Mongo API.
Refresh, owner reads and logout used the real backend contracts and a test cookie
jar. All other external/API traffic was blocked; no development application session
was revoked. No production or `GymFlow_dev` database was accessed or mutated.

Temporary `performance.mark` calls measured A through G. A DOM observer recorded
the boundary and Home mounting. All marks were removed before final validation;
no timing hook or artificial delay remains in application code. The probe and its
JSON evidence live only under the OS temporary directory.

Normal baseline runs: local clearing 0.1–0.3 ms, cache completion 3.3–4.7 ms from A,
server acknowledgement 24.0–24.5 ms from A, Home routing 721–746 ms after E, and
Home DOM at 794–813 ms. Router loading dominated these normal runs, not cache or
session restoration. Those runs did not reproduce the user's earlier several-second
latency, and do not establish the timing of that unrecorded request.

The existing ordering unnecessarily serialized server acknowledgement before
starting Home navigation. A controlled 3-second acknowledgement delay reproduced
the long blank state and demonstrated its removal without altering backend work:

| Stage, milliseconds from A | Before | After |
| --- | ---: | ---: |
| A: publish boundary | 0 | 0 |
| B: identity/access/session invalidated | 0.2 | 0.1 |
| C: cache clearing finished | 9.6 | 3.2 |
| D: revocation dispatched after auth lock | 13.4 | 11.0 |
| D: acknowledgement completed | 3038.4 | 3029.4 |
| E: `replace('/')` started | 3038.5 | 3.2 |
| F: replacement completed | 3828.5 | 688.2 |
| G: boundary released | 3828.5 | 688.2 |
| Home DOM mounted | 3936.8 | 737.1 |

Normal post-change runs mounted Home at 754–869 ms, with no unauthorized fallback
or browser page errors. The slow-acknowledgement run mounted Home before D ended,
also without the fallback or page errors. These are automated DOM observations,
not the user's manual visual PASS. A cold/slow Next development route can still
take time; loading Home's actual code/props is a real remaining prerequisite.

## Ordering and security

Previously: publish boundary; invalidate credentials/profile/generation; await
cache; await locked revocation; start/await Home replacement; release boundary.

Now: publish boundary; immediately invalidate the same local state; await cache;
start locked revocation and Home replacement together; release the boundary when
navigation completes; continue awaiting revocation separately. `logOut` still
returns true only after successful navigation and confirmed revocation. There is
no full reload, arbitrary timer, animation, retained authenticated profile, or guard
change. The cache still clears before navigation because it can contain private
data. Its measured cost is a few milliseconds.

- `signingOut` owns the whole operation, independently of the shorter UI state.
  Duplicate logout calls remain blocked after Home mounts. Focus/bootstrap does
  not launch another revocation during that operation.
- The persistent `gymflow.logoutPending` flag remains until acknowledgement.
  `ensureAccessToken(false)` returns an empty credential while pending, allowing
  public Home queries as an anonymous visitor without refreshing. Required auth
  still rejects. Backend public/required guards use Bearer credentials, not the
  refresh cookie; no authenticated permission is granted by this change.
- In-flight refresh and private Apollo responses retain generation fencing.
  Reload during pending revocation retains the persistent fence and retries logout
  rather than restoring the old owner. Successful logout leaves the session revoked.
- Explicit login/signup waits for an already-started revocation so its late cookie
  clear cannot erase the new refresh session, including without Web Locks. Existing
  account switching during cache clearing can still supersede an obsolete logout
  before its revocation dispatch. This is scoped to logout, not a persistent-login audit.
- Server failure returns false, retains pending revocation and the existing auth
  error, and leaves Home anonymous. Required auth and automatic refresh remain
  blocked. Existing focus/reload recovery retries revocation.
- Cache failure still attempts revocation and refuses Home navigation. Navigation
  failure/cancellation releases the UI boundary and leaves the protected guard
  denying access while revocation finishes. Settled failures cannot retain the
  progress UI. Replacing the current history entry remains unchanged.

## Changes and validation

Application code changes only in `libs/auth/index.ts`. The existing App boundary,
Admin/USER/TRAINER guards, Home design, backend contracts and business rules remain
unchanged. `scripts/test-logout-navigation.cjs` now requires Home before a held
acknowledgement and checks anonymous reads/refresh blocking. The auth/session suite
adds real disposable-API tests for public Home reads, pending reload/recovery and
new-login ordering without Web Locks. The P1 note links here as historical context.

| Command | Result |
| --- | --- |
| `yarn node scripts/test-logout-navigation.cjs` | 8 passed, including ADMIN/USER/TRAINER and every committed render |
| `yarn node scripts/test-auth-session.cjs` | 21 passed |
| `yarn node scripts/test-auth.cjs --integration` | 25 passed |
| `yarn node scripts/test-admin-workspace.cjs` | 10 passed |
| `yarn node scripts/test-user-profile.cjs --integration` | 24 passed |
| `yarn node scripts/test-trainer-profile.cjs --integration` | 14 passed |
| `yarn typecheck` | Passed after instrumentation removal |
| `yarn lint --no-cache --file libs/auth/index.ts` | Passed |
| Isolated production `yarn build` | Passed, 105 pages; inherited image/font, workspace, CSS, i18next and page-data warnings only |

Integration writes use only disposable loopback databases and owned temporary
uploads. Production build uses a separate temporary source/`.next`, no copied
`.env` files and reserved example API URLs. No GraphQL document/schema changed.

Protected SHA-256 values remain unchanged before/after:

- `public/locales/en/common.json`:
  `C57B28C4F5AF88E38688F1BFE3289710EEDA2E387C0F50E1A060BEBFD771502A`.
- Backend `docs/ai/COMPLETED_TASKS.md`:
  `A3800B213F112364D305C8FB4421E2994429C3A5BE05A529E49FBD3DDED5319F`.

The 19 G7C-B deployment files and backend deployment test retain their baseline
hashes, unstaged/uncommitted. The protected completion log is not updated; this note
records the follow-up instead. No deployment work, push, amend, or backend change.

## Manual browser QA

Use the local frontend and existing development QA accounts. Repeat at desktop and
mobile widths. Human visual confirmation is pending.

1. ADMIN: sign in, open `/_admin/gym-access`, use sidebar Log out. Verify Home
   follows with no administrator-required fallback and no multi-second blank status.
   Repeat from `/_admin/profile`, confirming profile Logout.
2. USER: sign in, open `/mypage?category=myProfile`, Logout and confirm. Verify Home
   and guest Login/Register navigation, without a private-access fallback.
3. TRAINER: repeat from `/mypage?category=myProfile`. Verify Home without retained
   workspace content. Repeat the three roles with slow network throttling to check
   that a slow logout request does not hold Home until its response.
4. For each role, press Back and reload. No authenticated content may return. An
   older protected entry may show its normal denial. While anonymous, directly open
   `/_admin/gym-access`; the Admin guard must still deny it.
5. Optional failure check: go offline immediately before confirming logout. Verify
   no protected content returns. Restore network and focus/reload; pending recovery
   must not sign the old account back in. A new explicit login is a separate action.

LOGOUT TRANSITION FOLLOW-UP — READY FOR MANUAL QA
