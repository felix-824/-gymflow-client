# TG-C3 Admin Gym Access moderation

Implementation and automated QA evidence, November 3, 2026 (Asia/Seoul). Final manual visual approval, production access cutover and deployment remain deferred.

## Recovery from interrupted run

Resumed the existing working tree on `modification` at the expected frontend/backend HEADs. Staging was empty. All 24 TG-C3 files listed under **Files** below already existed as unstaged modifications or new files before resume; the protected EN common and backend completion log were also already modified. No work was reset, restored, stashed or discarded.

Recovery review covered every scoped tracked diff and new source, type, route, locale, style, test and report file. Navigation, routes, bounded server reads, all four status presentations, moderation/reconciliation, EN/KR/RU, accessibility, responsive layouts and regression coverage were already implemented. No incomplete source, placeholder implementation, duplicate operation/type, broken import, partial locale, temporary application debug code or unfinished test was found. No feature requirement remained unstarted.

The unfinished handoff consisted of final evidence/report review and the requested single commit. One new lint warning was found in the detail effect cleanup: incrementing its request sequence was redundant because cleanup already sets the mounted fence false; the next setup/read increments the sequence before any previous completion can apply. Removed only that redundant increment, preserving route-leave invalidation and all account/session/request fences. Scoped lint then passed with only seven inherited shell warnings. Focused integration, typecheck and the isolated production build were rerun for the final source. The report's pending build result and inaccurate inherited-warning count were corrected. Existing implementation and browser/regression evidence were preserved; the final commit includes the complete reviewed TG-C3 change.

## Starting state and audit

Both repositories were on `modification`, with empty staging:

- Frontend `bae6ef9d96fe68aaf333f0a6c18d35c70833172f`; only protected `public/locales/en/common.json` modified.
- Backend `bb08174f51e90c44144ab1f79528a76d1d98b93f`; only protected `docs/ai/COMPLETED_TASKS.md` modified.

Read AGENTS.md, sibling migration/decisions/frontend migration and current production-readiness documentation, development fixture documentation, TG-C1/TG-C2 helpers/types, Admin Users/Applications/Programs/Gyms/Community, shell/navigation, details/dialogs, alerts, styles/locales, and actual TG-B2 resolver/DTO/validation/service. Inspected original `nestar-next` Admin menu and Users implementation before editing. Older migration-document deferrals are historical; current production-readiness and source describe implemented booking/access contracts.

The project retains Next Pages Router, the existing `withAdminLayout`, MUI, Apollo, manual TypeScript types, locale JSON and SCSS imports. The existing sidebar has a permanent desktop drawer and temporary tablet/mobile drawer. No second shell, dependency, routing system or global cache change was introduced.

Existing listeners were reused: frontend 3000/PID 21248, backend 3007/PID 12592. No duplicate Next/Nest server or normal backend startup was performed. Production builds use an owned temporary source copy, with public assets/dependencies reused, no copied `.env` files and a separate build directory.

## Actual TG-B2 contracts

| Operation | Input | Selected result |
| --- | --- | --- |
| `getTrainerGymAccessesByAdmin` | `input: TrainerGymAccessesAdminInquiry!` | paginated `list`, `metaCounter { total }` |
| `getTrainerGymAccessByAdmin` | `accessId: String!` | bounded access detail |
| `reviewTrainerGymAccess` | `input: TrainerGymAccessReview!` | authoritative bounded detail |
| `revokeTrainerGymAccess` | `input: TrainerGymAccessRevoke!` | authoritative bounded detail |

List input contains only `page`, `limit` (1–100), `search { status?, trainerId?, gymId? }`. Status omission means ALL. No text/name search or caller sort/direction exists. Backend ordering is newest `createdAt`, then `_id`, descending. UI uses 10/20/40/60 page sizes and backend totals. Exact-ID fields are labeled honestly; malformed IDs are rejected before dispatch. IDs are never displayed as record metadata.

Review contains `accessId`, `decision: APPROVED | REJECTED`, and `rejectionReason` only for rejection. Approval omits that optional field entirely. Revoke contains `accessId`, `revocationReason`. Reasons are required, trimmed, 1–1000 characters. Reviewer/revoker identities and timestamps remain server-owned. The actual resolver requires ADMIN and services check ACTIVE ADMIN on reads and writes.

Enums are reused from TG-C1: `PENDING`, `APPROVED`, `REJECTED`, `REVOKED`; relationship values `WORKS_HERE`, `INDEPENDENT_TRAINER`, `FACILITY_PERMISSION`. Human labels describe the reported relationship and GymFlow venue permission. No employment-verification claim was introduced.

Selections omit `reviewedBy`, `revokedBy`, internal versions, passwords, phone/auth/session data and unrestricted Member/Gym documents. Trainer summary selects only `_id`, nickname, full name, image, current type/status. Gym summary selects only `_id`, name, lifecycle status, location/address and one image. List selects status/relationship/dates; detail and mutation receipts additionally select request note and rejection/revocation reasons. Summary IDs support exact filters/navigation internally and are not rendered as security metadata.

## Navigation, list and detail

**Gym Access Requests** is placed immediately after Trainer Applications in the existing Admin menu. Shell title/active state and EN/KR/RU menu labels use the established locale-JSON helper. Routes are `/_admin/gym-access` and `/_admin/gym-access/detail?id=<accessId>`, with existing static translation props and layout wrapping. Direct navigation and reload are supported. Detail links carry the current list inquiry for Back navigation; list remount reads fresh authoritative totals.

Pending is the default, matching Trainer Applications' moderation-first convention. ALL and each of the four statuses are server filters. Trainer/Gym exact-ID filters combine with status, reset pagination, and can be cleared independently. There is no misleading search over one server page and no unbounded history read. An emptied last page is corrected from the server total.

Desktop uses an accessible six-column table. Below 900px it becomes stacked list entries rather than a compressed desktop table. Rows show bounded Trainer/Gym identity, relationship, status text, requested/reviewed/revoked dates where present, and Review/View links. Detail uses bounded Trainer/Gym summaries, request note, relationship, dates and terminal reasons. Missing summaries have truthful unavailable labels rather than guessed data. Dates use the selected locale and Asia/Seoul timezone.

ACTIVE ADMIN gating occurs in both the existing shell and the feature boundary. Private children remount on account/session changes. Detail reads and mutation completions are fenced by mounted/account/session/route state and request sequence. USER, TRAINER, inactive Admin and unresolved/error sessions do not mount moderation queries or controls. The backend remains the security boundary.

## Moderation and recovery

- PENDING: Approve and Reject only. Confirmation identifies the Trainer and Gym. Approval describes venue permission and current eligibility checks.
- Reject: labeled required reason, raw character count, native maxLength 1000 and trimmed validation. Copy explains that this record closes and the Trainer may submit a new request later.
- APPROVED: Revoke only. Required revocation reason and deliberate confirmation explain restrictions on new linked use/new bookings while existing Programs and Reservations remain preserved.
- REJECTED/REVOKED: historical detail, dates and reasons, with no further moderation action. Original approval date remains visible after revocation.

Writes have synchronous duplicate locks plus pending control disabling. The frontend accepts only a matching authoritative receipt, displays the existing small success toast once, and rereads detail. Returning to the list runs its no-cache server query; no client access object/history is fabricated.

Every moderation failure triggers a detail read. Conflict and eligibility feedback are sanitized; stale actions are blocked. A different persisted terminal decision replaces the stale view and removes the invalid action. If the same decision persisted after a lost response, neutral reconciliation feedback is shown without sending another mutation or duplicating success toasts. If the result remains unresolved, the reason stays in the dialog and explicit **Reload latest state** reads are required before another submission. Confirmed write plus failed refresh is distinguished from an unconfirmed write. No automatic mutation replay occurs.

Backend TG-B2 still enforces first decision wins, exact same-actor/same-decision/same-reason retry, opposite-decision conflicts, current Trainer/Gym approval eligibility and operational uniqueness. TG-B3 Program and Reservation authorization was untouched.

Loading is deliberate, with no premature not-found flash. Query failures stay bounded inside the Admin shell and offer Retry. Pending empty and general empty results have separate copy and are not errors. Invalid detail IDs are rejected before a request. Read failures disable moderation rather than turning absence into permission.

## Localization and accessibility

New copy lives in `admin-gym-access` for EN/KR/RU; only the safe `admin-workspace` JSON gets the menu label. Protected EN common remains byte-identical.

Semantic headings/table/list/detail descriptions, real labels, text status, native reason length/count, invalid-field focus, visible focus, 44px actions and keyboard navigation are included. Cancel/Escape restore the action button; a completed action whose button disappears focuses the detail heading. Closing is blocked while a decision is pending. Long notes/reasons wrap; tablet/mobile summaries and controls stack.

Screenshot inspection caught a global MUI input height constraining the new multiline field and inherited dark text on coral filled buttons. Feature-scoped overrides give the multiline wrapper natural height, constrain dialog scrolling, and use white filled-button text. Browser assertions measure textarea containment and at least 4.5:1 enabled filled-button text contrast, in addition to overflow and touch targets.

## Files

Created:

- `libs/admin-gym-access.ts`
- `libs/types/trainer-gym-access/trainer-gym-access-admin.ts`
- `libs/components/admin/gym-access/{AdminGymAccess,GymAccessList,GymAccessDetail}.tsx`
- `pages/_admin/gym-access/{index,detail}.tsx`
- `public/locales/{en,kr,ru}/admin-gym-access.json`
- `scss/pc/admin/gymAccess.scss`
- `scripts/test-admin-gym-access.cjs`
- `scripts/test-admin-gym-access-browser.cjs`
- This report.

Modified:

- `apollo/admin/{query,mutation}.ts`
- `libs/components/admin/AdminMenuList.tsx`
- `libs/components/layout/LayoutAdmin.tsx` (section title only)
- `public/locales/{en,kr,ru}/admin-workspace.json`
- `scss/pc/main.scss` (one scoped import)
- `scripts/test-admin-programs-responsive.cjs`
- `scripts/test-admin-trainer-applications-responsive.cjs`

The two existing responsive scripts now wait for the actual rendered terminal/detail state instead of checking a query-dispatch/timer boundary. Their assertions remain intact; no unrelated Admin product source was changed.

## Validation

All frontend commands used Yarn 1.22.22 with installed Node 22.13.0. Counts are the scripts' reported checks/groups, not an aggregate claim of unique tests.

| Exact command | Result |
| --- | --- |
| `yarn node scripts/test-admin-gym-access.cjs --integration` | 48 focused helper/React/MUI/Apollo/real isolated-backend checks passed |
| `yarn check:graphql` | 74 documents validate against the running backend schema, read only; also validated against isolated current Nest schema |
| `yarn node scripts/test-admin-trainer-applications.cjs` | 13 checks passed |
| `yarn node scripts/test-admin-trainer-applications-responsive.cjs` | 12 checks passed |
| `yarn node scripts/test-admin-programs-responsive.cjs` | 14 checks passed |
| `yarn node scripts/test-admin-gyms.cjs` | 87 contracts/helpers, 39 list groups, 29 control groups, 46 editor groups, 4 disposable backend groups passed |
| `yarn node scripts/test-admin-users.cjs` | 15 checks passed |
| `yarn node scripts/test-admin-community-responsive.cjs` | 14 checks passed |
| `yarn node scripts/test-admin-workspace.cjs` | 10 checks passed |
| `yarn node scripts/test-trainer-gym-access.cjs --integration` | 46 TG-C1 checks passed |
| `yarn node scripts/test-program-approved-gyms.cjs` | 21 TG-C2 checks passed |
| `yarn node scripts/test-program-form-controls.cjs` | 59 checks passed in serial rerun |
| `yarn typecheck` | Passed after initial implementation and final recovery cleanup; final run 71.59s |
| `yarn lint --no-cache --dir libs/components/admin/gym-access --dir pages/_admin/gym-access --file libs/admin-gym-access.ts --file libs/types/trainer-gym-access/trainer-gym-access-admin.ts --file libs/components/admin/AdminMenuList.tsx --file libs/components/layout/LayoutAdmin.tsx --file apollo/admin/query.ts --file apollo/admin/mutation.ts` | Passed; seven inherited LayoutAdmin font/image/passHref warnings; no new-component warnings/errors |
| `yarn test:migration` | Existing unrelated Admin Users JSX prop-order assertion fails after nine passing checks; source and assertion are outside TG-C3 |
| `yarn --cwd C:\Users\lenovo\AppData\Local\Temp\gymflow-tgc3-build-n7uD14 build` | Passed on final source in 131.15s; 105 static pages generated, including localized Gym Access routes; isolated source copy, no copied environment files, placeholder API URL |

Focused coverage includes all status/action boundaries, server filters/pagination, malformed IDs, bounded summaries/privacy, empty/loading/error/Retry, reason trimming/limits, exact payloads, duplicate locks, authoritative refresh, stale opposite decisions, eligibility changes, lost approve/revoke receipts, account/session fencing and locale rendering. Integration uses the existing owned loopback Mongo replica-set fixture without application configuration fallback; real backend retries preserve original review/revocation metadata.

Browser command:

```powershell
$env:GYMFLOW_QA_PLAYWRIGHT='C:\Users\lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$env:GYMFLOW_QA_BROWSER='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
yarn node scripts/test-admin-gym-access-browser.cjs
```

The final matrix passed **66 captures**: EN/KR/RU × 1440/768/390 × Pending list, four status details, Reject dialog and Revoke dialog (63), plus mobile empty/error/loading (3). All widths passed. It also verifies direct reload, keyboard drawer navigation, reason focus/length, Escape focus restoration, USER/TRAINER direct-route denial and zero application moderation mutations. Every GraphQL request, including session bootstrap, is intercepted; unexpected operations are blocked. Final confirmation passed long textarea containment and at least 4.5:1 filled-button text contrast. Screenshots/measurements/requests: `C:\Users\lenovo\AppData\Local\Temp\gymflow-admin-access-browser-WEDm68`. Final mobile/dialog and tablet detail captures were visually inspected after the scoped fixes.

Browser page-error list was empty. Inherited notices were Next legacyBehavior deprecation, the shell's font stylesheet in `next/head`, Autoprefixer `end` compatibility and development HMR `isrManifest` messages. Node/DOM regression harnesses also emit existing punycode/MUI anchor warnings. No raw server diagnostics reached feature error copy.

The production build passed with inherited lint/tooling and large-page-data notices. The new Gym Access list/detail also trigger the large-page-data advisory at approximately 140 kB per page with the established shared `common` plus feature translation props. This is a P3 performance follow-up; translation architecture was preserved within TG-C3 scope.

Initial QA exposed test assumptions around MUI transitions, navigation-role lookup, clipped scrollable tabs and asynchronous legacy DOM rendering. Those assertions were corrected without weakening their intended checks. The Program form suite passed when run serially; no Program form source or test change was required.

## Security, manual login and preservation

Review found no remaining TG-C3 P0/P1 or implementation P2 issue. Checks covered non-Admin surface access, caller reviewer/revoker injection, private/raw Admin fields, illegal lifecycle actions, optimistic overwrites, duplicate writes, missing reasons, history mutation, employment claims, backend security changes, application DB writes, protected files and unrelated redesign. The multiline-wrapper and button-contrast defects discovered during inspection were fixed and confirmed. P3 limitations are inherited tooling/runtime notices, the new routes' approximately 140 kB translation/page-data advisory, and the unrelated migration assertion. Manual login availability and final human visual approval are explicit handoff limitations.

Development fixture documentation identifies an existing ACTIVE Admin review actor, but no safe known Admin password is documented. No password was invented, inspected from a stored hash, changed, or copied into frontend code/tests. No live login was attempted. Manual Admin login availability is therefore a handoff limitation; a separate narrowly scoped QA-login support task may be needed before manual sign-off.

No backend source, fixtures, credentials, schema, enforcement, documentation or Git history was changed. Backend HEAD remains `bb08174f51e90c44144ab1f79528a76d1d98b93f`. TG-C3 did not persistently mutate `GymFlow_dev`; production `GymFlow` was not connected or touched. All mutation tests used disposable fixtures or in-memory transport, and visual QA used intercepted query-only data.

Protected SHA-256 values before = after:

| File | SHA-256 |
| --- | --- |
| Frontend `public/locales/en/common.json` | `C57B28C4F5AF88E38688F1BFE3289710EEDA2E387C0F50E1A060BEBFD771502A` |
| Backend `docs/ai/COMPLETED_TASKS.md` | `A3800B213F112364D305C8FB4421E2994429C3A5BE05A529E49FBD3DDED5319F` |

The explicitly protected backend completion log is left unchanged; this frontend report records the work instead. Only scoped TG-C3 frontend files will be staged for the requested single commit, `feat: add trainer gym access moderation`. No backend commit and no push. The final response supplies the resulting hash and post-commit Git status.

Deferred: final manual TG-C3 visual QA; production TrainerGymAccess cutover; deployment. Manual Admin login support, if required, is a separate task.
