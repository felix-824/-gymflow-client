**AUTH-P2 — refresh edge-case decisions and targeted hardening**

Audited November 4, 2026. Starting frontend: `modification`, `4a2bf3b`; starting backend: `modification`, `1829d94`. AUTH-P1's normal persistent-login result remains valid. This phase preserves memory-only access credentials, the fixed 30-day session, production cookie attributes, atomic rotation/reuse rejection, current-account authorization, and both logout fixes.

| Finding | Decision | Reason | Security risk | UX impact | Complexity |
| --- | --- | --- | --- | --- | --- |
| P2-A: post-dispatch access expiry | FIX NOW | Preserve the backend's existing expiry discriminator; renew through existing single-flight and retry reviewed read-only queries once. | No mutation replay, no partial-result replay, no speculative renewal on generic 401. | Confirmed expiry no longer clears an otherwise valid identity; actions requiring reconciliation remain explicit. | Small formatter metadata change plus bounded Apollo dispatch handling. |
| P2-B: rotated response lost before cookie delivery | DOCUMENT / MITIGATE | Retain strict family revocation on old-credential reuse. | A previous-token grace window would also admit a stolen credential; cached acknowledgements require additional secret/lineage state and rules. | Rare transport failure can require sign-in again. Preserve drafts on temporary failure; do not loop refresh. | No refresh-protocol redesign. |
| P2-C: tabs without Web Locks | DOCUMENT / MITIGATE | Native locks coordinate supporting same-origin tabs; unsupported clients retain server-enforced fail-closed behavior. | BroadcastChannel requires suspended-tab/crash recovery; localStorage leases are not an atomic mutex; server grace has the P2-B replay tradeoff. | Single-tab use works; simultaneous refresh on unsupported clients can require sign-in again. | No new leader election, lease, or cross-tab token transport. |
| P2-D: public startup depends on bootstrap | FIX NOW | Reviewed public roots can dispatch anonymously while no access credential is available. Refresh active public personalization after owner restoration. | Private/mixed/unknown operations still wait; old-generation results cannot enter cache; late anonymous results cannot overwrite restored personalization. | Home and Program/Gym/Community/Trainer discovery can load while restoration is slow or fails. | Root-field policy, existing Apollo refetching, and removal of Trainer-page auth-ready skips. |

These DOCUMENT / MITIGATE decisions are the explicitly retained v1 availability tradeoffs under this phase's decision rule. They are not claims that network-loss recovery or older-client coordination was implemented. No P0/P1 was found. Final disposition: P0=0, P1=0, P2=2 retained (B/C), P3=2 retained (unknown-auth navbar presentation and existing lint debt outside changed scope). A/D are resolved within the bounds described here.

**Error handling and retry contract**

| Response | Handling |
| --- | --- |
| UNAUTHENTICATED + extensions.reason=ACCESS_TOKEN_EXPIRED, with a sent access credential | Share cookie-authorized renewal. Keep the logical session identity; the server still checks current account/session. |
| Same response, reviewed read-only query, no partial data | Dispatch the original query once more with renewed access. A second expiry stops; it cannot trigger an infinite refresh/retry chain. |
| Same response, mutation, view-recording query, unreviewed query, or partial data | Renew access but never replay the operation. Return AUTH_ACTION_RETRY_REQUIRED: "Your session was renewed. Check the result before trying again." Reconcile the result before an explicit new action. |
| Generic HTTP 401 or UNAUTHENTICATED without the exact expiry discriminator | Existing terminal invalidation remains; no speculative retry. Missing/invalid/revoked/inactive account details remain generic. |
| Expired/revoked/invalid refresh | Existing invalidation/cookie clearing; do not dispatch a private retry. |
| FORBIDDEN | Existing owner restoration/current-role handling; no replay and no role bypass. |
| Temporary backend/network failure | Surface failure and preserve established identity/drafts. Never replay an uncertain mutation. |
| Logout/account switch during renewal | Existing auth generation/pending-revocation fences discard stale results before Apollo/cache or any retry. |

Only ACCESS_TOKEN_EXPIRED was added to the formatter's public reason allowlist. INVALID_SESSION, REFRESH_REUSE, and account details remain hidden. The refresh credential, session ID and secrets are not added to errors or storage. Exact classification comes from the actual backend exception, not a guessed frontend clock or translated message.

Ordinary refresh still starts before dispatch when access has less than 30 seconds remaining. Late expiry responses reuse a credential already renewed by their cohort, including a valid credential close to the absolute deadline. Native locks and per-generation single-flight are unchanged. The response-recovery path respects skipAuth/skipRefresh contexts.

**Operation review**

The policy checks the actual GraphQL operation type and every top-level field, including aliases. A mutation named like a query cannot enter the retry path. Unknown roots, root fragments and mixed public/private selections fail closed to normal authenticated dispatch. This is a conservative explicit allowlist, not an inference from operation names.

Safe query retry roots are the reviewed public list/availability roots plus:

```text
checkAuth, getMyMember, getMyReservations, getTrainerReservations,
getMyTrainerSchedule, getTrainerPrograms, getFavorites, getVisited,
getMyBoardArticle, getMyBoardArticles, getMyTrainerApplication,
getMyApprovedGyms, getMyTrainerGymAccesses, getAllMembersByAdmin,
getAllProgramsByAdmin, getAllBoardArticlesByAdmin, getAllGymsByAdmin,
getGymByAdmin, getTrainerApplicationsByAdmin, getTrainerApplicationByAdmin,
getTrainerGymAccessesByAdmin, getTrainerGymAccessByAdmin
```

getProgram, getMember and getBoardArticle record views and are excluded from automatic expiry retry. Their public visibility still comes from backend resolvers. A standalone __typename field is harmless; fragments must be reviewed/handled explicitly before expanding this policy.

| Mutation classification | Operations | Automatic replay |
| --- | --- | --- |
| Safe only with the existing idempotency key and identical payload | createProgram: preserve createRequestId and payload; its stored receipt reconciles a repeated submission. | Never. A disposable test explicitly repeated the same keyed request and verified one Program. |
| Safe only with existing revision fence and outcome reconciliation | updateProgram, updateProgramByAdmin and updateGymByAdmin. Existing expectedRevision rules remain authoritative. A revision is a conflict fence, not an idempotent success receipt. | Never. Do not fetch a new revision and blindly resubmit an uncertain action. |
| Unsafe to blindly replay | reviewTrainerApplication, reviewTrainerGymAccess, revokeTrainerGymAccess, createGym, createReservation, cancelReservation, updateTrainerReservation, createReview, saveMyTrainerSchedule, submitTrainerGymAccess, submitTrainerApplication, updateMember, updateMemberByAdmin, likeTargetMember, likeTargetProgram, likeTargetBoardArticle, subscribe, unsubscribe, createBoardArticle, updateBoardArticle, updateBoardArticleByAdmin, createComment, updateComment, removeCommentByAdmin, removeProgramByAdmin, removeBoardArticleByAdmin; auth login/signup/refresh/logout operations. | Never. Transactional booking enforcement, toggles, state-fenced moderation, publication and credential operations are not a generic replay contract. |

createGym is a creation without an idempotency receipt; it is unsafe to blindly replay even though later Gym updates use expectedRevision. No schema/input, createRequestId, expectedRevision, reservation transaction, counter, or moderation semantics changed. SAFE TO RETRY means the reviewed read-only queries above, not any business mutation.

**Public startup and personalization**

Public roots are getPrograms/getProgram, getGyms/getGym, getTrainers/getMember, getBoardArticles/getBoardArticle, getComments, getReviews, getMemberFollowers/getMemberFollowings and getProgramAvailability. No access in memory means these can dispatch without waiting for cookie restoration. Unknown/private/mixed roots continue through ensureAccessToken. Booking/profile/Admin UI bootstrap guards remain intact.

Owner restoration refetches active public queries with request deduplication disabled for that refresh, so an in-flight anonymous response cannot be mistaken for authenticated personalization. Existing Apollo request ordering plus the link's late-anonymous response check keep guest results from overwriting restored identity results. Private forms are not refetched by this hook. Same-owner focus/profile updates do not cause a public refetch storm.

Trainer list/detail no longer skip public data merely because authReady is false. Follow/like actions retain existing identity checks. Navbar inspection found the existing guest-to-owner presentation while auth is unknown; improving that remains P3. With an established in-memory token, the existing proactive renewal path remains in use to preserve personalized semantics; this phase specifically decouples unresolved startup/public bootstrap, not every personalized read from auth availability.

**Rotation, tabs and session authority**

No grace interval, previous-token acceptance, new cookie, lineage store, sliding expiry, or weaker replay rule was added. A refresh response lost before cookie delivery can leave the browser with a spent credential; reuse then revokes the family. Reauthentication is the chosen v1 mitigation. Increasing access lifetime would not solve this safely and was not done.

Web Locks provides same-origin coordination in secure contexts. Current browser documentation marks it widely available, but no claim is made that all embedded/old clients implement it. Feature detection remains the runtime boundary; real Edge and simulated no-lock paths were tested. Separate origins do not share a lock. Canonical same-origin HTTPS remains the deployment recommendation. See [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) and the [Web Locks specification](https://w3c.github.io/web-locks/).

With native locks, tabs serialize cookie-changing operations. Without them, simultaneous old-cookie refresh may revoke the family, but cannot authenticate a revoked session. Logout/storage events invalidate other-tab state; even if an event is missed, every backend private request checks the session/current member. Explicit login still waits for active logout revocation. Both 5ea1df4 and 4a2bf3b remain in history and their security boundaries remain intact.

Access remains 900 seconds, capped by remaining session life. Refresh/session/cookie share the original 2,592,000-second deadline; no sliding renewal. Mongo expiresAt TTL is housekeeping, not authorization. BLOCK/DELETE, invalid Admin status, current role and password/session revocation remain server-authoritative.

**Validation**

| Check | Result |
| --- | --- |
| Backend auth/session integration | 58 passed |
| Backend current-account authorization unit tests | 35 passed |
| Backend GraphQL production formatter | 25 passed |
| Backend member privacy integration | 24 passed |
| Frontend existing auth/session | 21 passed |
| Frontend logout navigation/history/frames | 8 passed |
| Frontend auth/form/role integration | 25 passed |
| Frontend USER Profile | 24 passed |
| Frontend TRAINER Profile | 14 passed |
| Frontend Admin Workspace | 10 passed |
| New auth edge-case suite | 18 passed |
| Disposable controlled-time regression | 29 passed |
| Disposable browser/cookie/index/HTTP audit | 8 passed |
| Total | 299 passed |

The focused suite is `yarn node scripts/test-auth-edge-cases.cjs`. It exercises actual frontend auth/Apollo and actual backend error formatting against its own disposable API/MongoDB. It covers 12 simultaneous post-dispatch expiry responses for each role, one-retry limit, revoked refresh, ordinary/keyed mutation non-replay, partial-result non-replay, public startup/outage, personalized refetch, stale anonymous responses, lost Set-Cookie delivery, coordinated/uncoordinated tabs and logout versus refresh without Web Locks.

The controlled-time regression reused AUTH-P1's temporary disposable runner for T0, +901 seconds, +1/+7 days, 30 days minus 10 seconds, and expired-but-retained Mongo rows across all roles; it also checks BLOCK/DELETE, role change, revoked/deleted sessions, logout restart and independent device sessions. The browser audit used a fresh temporary Edge profile and synthetic intercepted HTTPS origin backed only by the owned loopback API. It proved HttpOnly/Secure/host-only cookie handling, real browser restart persistence, native two-tab locks, logout rejection and cleared-cookie restart. It is not deployed TLS/proxy verification. Temporary lifecycle/browser runners were not added to the application repository.

Frontend and backend API typechecks pass. Changed backend scope lint passes. Frontend changed-scope lint passes with two pre-existing Trainer warnings (font placement and img usage). AUTH-P1's broader backend legacy lint debt was not edited or represented as a new regression. A transient USER test timeout exposed test-only identity injection racing an unfinished logout; its fixture now awaits the tracked logout promise before injecting the next identity, matching the existing explicit-login contract. The auth VM test now loads the policy dependency. No product auth/security behavior was weakened to satisfy tests.

**Files, Git and preservation**

Frontend product files: apollo/auth-policy.ts, apollo/client.ts, libs/auth/index.ts, pages/trainer/index.tsx and pages/trainer/detail.tsx. Related tests: scripts/test-auth-edge-cases.cjs, test-auth-session.cjs, test-auth.cjs, test-trainer-reservations.cjs and test-user-profile.cjs. This decision report is docs/ai/AUTH_P2.md. Backend: src/libs/graphql.config.ts and the two focused test files under apps/gymflow-api.

Backend commit: `9825d96` — fix: expose recoverable access expiry. The frontend implementation/report commit is separate; see the phase completion report/Git log for its final hash. No existing commit was amended/reset/rebased. No push or deployment occurred.

| Protected file | SHA-256 before = after |
| --- | --- |
| Frontend public/locales/en/common.json | C57B28C4F5AF88E38688F1BFE3289710EEDA2E387C0F50E1A060BEBFD771502A |
| Backend docs/ai/COMPLETED_TASKS.md | A3800B213F112364D305C8FB4421E2994429C3A5BE05A529E49FBD3DDED5319F |

All nineteen G7C-B deploy candidate files plus the backend deployment-package.integration-spec.ts candidate remain byte-identical, untracked, unstaged and uncommitted. With the two protected files, 22 hashes were compared. The phase completion report includes the full machine-readable before/after hash inventory. Their Linux rehearsal remains blocked/outside this phase.

Expected final working-tree status after focused commits: frontend only ` M public/locales/en/common.json` and `?? deploy/`; backend only ` M docs/ai/COMPLETED_TASKS.md`, `?? apps/gymflow-api/test/deployment-package.integration-spec.ts` and `?? deploy/`. Both branches remain modification; no staged changes remain. Protected-file existing modifications were never reset, restored, staged or committed.

No GymFlow or GymFlow_dev connection/access/mutation/seed, production credentials, production session inspection, production service access, push or deployment was used. All writes were repository changes explicitly scoped above, or owned disposable databases/test storage. No dependency installation or production build was needed for this phase.

**Closure decision**

Authentication Hardening can close with the explicitly bounded v1 tradeoffs B/C above. Remaining manual behavior is deliberate: unreplayed mutations/side-effect queries require result reconciliation, unknown root documents default to normal auth handling, and unknown-auth navbar presentation remains polish. Fixed expiry, browser site-data retention and backend availability remain normal persistent-login conditions.

Recommended next project phase: resume G7C-B Linux deployment-package rehearsal only in a genuine Linux runtime, using an isolated target/disposable data, and verify HTTPS/proxy/cookie/CORS behavior there before any separately authorized deployment. Do not resume packaging edits or production operations from this report alone. Remaining product polish/lint work can stay separate from the closed authentication scope.

AUTHENTICATION HARDENING — CLOSED
