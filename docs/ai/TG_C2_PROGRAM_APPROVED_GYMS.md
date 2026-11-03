# TG-C2 Program approved Gym selector

Implementation and automated QA evidence, November 3, 2026 (Asia/Seoul). Final manual visual approval and deployment remain deferred.

## Starting state and source audit

Both repositories were on `modification`, with empty staging:

- Frontend `670a7575b84dd3685f840cb44b6f40ab887028f8`; only protected `public/locales/en/common.json` modified.
- Backend `bb08174f51e90c44144ab1f79528a76d1d98b93f`; only protected `docs/ai/COMPLETED_TASKS.md` modified.

Read AGENTS.md, sibling backend migration/decisions/frontend migration and current production-readiness documentation, TG-C1 implementation, Program editor/helpers/types/documents, management and public routing, styles/locales, backend owner approved query/DTO/service, and TG-B3 Program/Gym/access fences. Inspected original `nestar-next/libs/components/mypage/AddNewProperty.tsx` before editing.

The existing Pages Router `/mypage?category=addProgram[&programId=...]` uses one Trainer-only `AddNewProgram` form, local React state, native controls, Apollo reads/mutations, existing SCSS and next-i18next. Edit loads owned Programs, including PAUSED ones, with `getTrainerPrograms`, not public detail. The form already handles revision conflicts, reservation constraints, uploads, ONLINE clearing, Gym-derived location/address, and frozen sessionStorage create receipts. Admin uses separate status controls; it does not mount this selector. Program public routes and reservation/history components were not changed.

Ports 3000 (PID 21248) and 3007 (PID 12592) already had listeners. They were reused; no duplicate Next/Nest process or normal backend startup was performed. The production build uses a separate temporary source copy to preserve the running development server's `.next` directory.

## Contract and resulting behavior

`GET_MY_APPROVED_GYMS` is the single new frontend document:

```graphql
query GetMyApprovedGyms($input: TrainerApprovedGymsInquiry!) {
  getMyApprovedGyms(input: $input) {
    list { _id gymName gymLocation gymAddress }
    metaCounter { total }
  }
}
```

Input contains only `page`, `limit` (1–100), and `search` with optional `text` (up to 100 characters). There is no client owner identity, status, sort or direction. The resolver derives the authenticated owner, requires an ACTIVE TRAINER, and the service returns APPROVED owner/Gym pairs joined to ACTIVE Gyms. PENDING, REJECTED, REVOKED, absent access, other owners and inactive Gyms are excluded by the server. No public catalog/history join or fixture identity exists in the selector.

Create keeps compact search and a native select, with Gym name, localized region and address. Selecting an approved Gym uses the existing form callback to set `gymId`, location and address together. Location/address remain frozen while linked. The independent option remains available, including loading/error/zero-approved states; it restores manual location/address fields. ONLINE hides the selector and clears Gym, physical address and location using the established type handler.

The zero-approved state explains requesting access or using an independent location. A contextual **Manage gym access** link uses `/mypage?category=gymAccess`; Next preserves the locale prefix. The TG-C1 request form is not duplicated.

Existing approved venues are shown normally. Current approval is checked against unfiltered owner results separately from the selector search/page, scanning pages of 100 as necessary. This prevents a filtered/off-page Gym being mislabeled unavailable. Neither read writes the form. A revoked/pending/rejected/absent current venue is retained as a disabled current option, with its known name/address and explicit inactive-access text. If historical Gym data is unavailable, the stored association and form location/address remain, with an unavailable label rather than an invented name.

`programUpdatePayload` compares the normalized draft with the loaded original and omits unchanged `gymId`, `programLocation` and `programAddress`. Description-only metadata edits therefore cannot accidentally become venue changes. Explicit unlink sends null; explicit reassignment sends the approved target and any changed location/address. `expectedRevision`, refresh-after-conflict behavior and createRequestId/frozen receipt recovery remain intact.

Resume remains in the existing My Programs confirmation dialog. A linked Program requires a fresh owner approval check; confirmation is disabled while checking, when unavailable, and on error. Missing approval gives guidance and Manage access; query failure offers Retry. Independent/ONLINE resume and Pause/Delete keep existing behavior. Stale-access mutation rejection receives translated feedback; it never becomes a success or automatic retry. TG-B3 still authorizes the Program owner and target Gym, including Admin mutations.

Existing reservation constraints continue disabling sensitive venue controls. Server reservation-lock conflicts keep the draft, block blind replay and require explicit refresh. Approval never overrides those locks.

Approved reads use local `no-cache`, deduplication bypass and local error handling, consistent with the editor. They rerun on mount, search/page/retry changes, and window focus. Return from Gym Access therefore reads current data without changing global Apollo cache policies. Old requests are ignored on cleanup; owner/session changes remount the selector through the existing scope key. A failure never falls back to public Gyms. Other edits and independent/ONLINE flows remain available.

Native labels/keyboard behavior, described helper/status text, polite loading announcements, bounded errors, text-based unavailable status, visible focus and at least 44px selector actions are retained. EN/KR/RU use only the safe existing `gyms` namespace. No protected common namespace edits were made.

## Files

Created:

- `libs/program-gym.ts`
- `scripts/test-program-approved-gyms.cjs`
- `scripts/test-program-approved-gyms-browser.cjs`
- This report.

Modified:

- `apollo/user/query.ts`
- `libs/components/program/ProgramGymSelector.tsx`
- `libs/components/mypage/AddNewProgram.tsx`
- `libs/components/mypage/MyPrograms.tsx`
- `libs/program.ts`
- `public/locales/{en,kr,ru}/gyms.json`
- `scss/pc/mypage/addNewProgram.scss`
- `scripts/test-form.cjs`
- `scripts/test-trainer-programs.cjs` (JSON imports and namespace-aware translations in its existing loader so current layout/editor regressions can run).

## Validation

All frontend commands use Yarn 1.22.22 with the installed Node 22.13.0 runtime. Counts below are the scripts' check/group counts, not a claim that every count represents a separate test case.

| Exact command | Result |
| --- | --- |
| `yarn node scripts/test-program-form-controls.cjs` | 59 focused form/selector checks passed |
| `yarn node scripts/test-program-approved-gyms.cjs` | 21 helper/contract/real isolated integration checks passed |
| `yarn node scripts/test-trainer-gym-access.cjs --integration` | 46 TG-C1 checks passed |
| `yarn check:graphql` | 70 documents validated against the running backend schema, read only |
| `yarn node scripts/test-trainer-programs.cjs` | 19 management/role/pagination/navigation/revision/integration checks passed |
| `yarn test:integration` | 9 disposable application integration groups passed, including Program Create/Edit, discovery, auth, member/Admin flows and uploads |
| `yarn node scripts/test-gym-catalog.cjs` | 33 groups passed |
| `yarn node scripts/test-gym-detail.cjs` | 54 groups passed, including public Program links, layout and actual mobile navigation |
| `yarn node scripts/test-home-programs.cjs` | 36 homepage/public-list media and payload checks passed |
| `yarn node scripts/test-admin-workspace.cjs` | 10 checks passed |
| `yarn node scripts/test-trainer-dashboard.cjs` | 4 groups passed |
| `yarn node scripts/test-trainer-reservations.cjs` | 5 helper/locale groups passed |
| `yarn node scripts/test-my-bookings.cjs --integration` | 23 history/booking/reconciliation/integration checks passed |
| `yarn node scripts/test-trainer-schedule.cjs` | 11 checks passed |
| `yarn typecheck` | Passed after implementation and again after test updates |
| `yarn lint --no-cache --file libs/program-gym.ts --file libs/program.ts --file libs/components/program/ProgramGymSelector.tsx --file libs/components/mypage/AddNewProgram.tsx --file libs/components/mypage/MyPrograms.tsx --file apollo/user/query.ts` | Passed; two existing image warnings in AddNewProgram/MyPrograms |
| `yarn test:migration` | Known unrelated failure after 9 passing checks: untouched Admin Users JSX prop-order assertion expects `inputProps` immediately after `OutlinedInput` |
| `yarn build` | Passed in owned temporary source copy; 205.19 seconds, no application server restart |

The focused suite verifies zero/loading/error/Retry, multiple approved choices, explicit unlink/switch/ONLINE clearing, EN/KR/RU historical guidance, named unavailable current venues, description-only mutation field omission, revision preservation, stale-access feedback, focus refresh and no public-query fallback. Backend integration uses the existing owned loopback Mongo replica set fixture, with no application configuration fallback, and verifies actual eligibility exclusions, roles, revocation, approved switch/reactivation, reservation locks and Admin owner authorization. All 70 documents also validate against that fixture's current code-first schema.

The build used `C:\Users\lenovo\AppData\Local\Temp\gymflow-tgc2-build-PHB1hf` with copied source/config, read-only use of the existing public assets/dependencies, no copied `.env` files, and command-scoped `REACT_APP_API_URL=https://gymflow.example` / `REACT_APP_API_GRAPHQL_URL=https://gymflow.example/graphql`. This is build validation, not deployable runtime configuration or a deployment. It completed type validation, compilation, static generation and route output. Inherited warnings include legacy images/fonts, multiple-lockfile root inference, Autoprefixer compatibility, Webpack cache serialization and large localized page data. No protected file or running server build directory was rewritten.

Browser command:

```powershell
$env:GYMFLOW_QA_PLAYWRIGHT='C:\Users\lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$env:GYMFLOW_QA_BROWSER='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
yarn node scripts/test-program-approved-gyms-browser.cjs
```

38 captures passed: EN/KR/RU × 1440/768/390 × Create/approved Edit/unavailable Edit/zero-approved Create (36), plus mobile loading/error (2). Each width passed overflow/wrapping/touch-target checks; selector focus and keyboard navigation to Manage access were tested. Approved and unavailable reactivation confirmations were also checked without saving. Long current names/addresses were inspected at mobile and desktop. Screenshots and measured results: `C:\Users\lenovo\AppData\Local\Temp\gymflow-approved-program-browser-Y3UDHr`.

All browser GraphQL traffic, including session bootstrap, was intercepted; unexpected operations were blocked. No public Gym query or application mutation was dispatched. Runtime page-error list was empty. Notices were inherited development warnings: custom font stylesheet in `next/head`, Autoprefixer `end` compatibility, and Next development HMR `isrManifest`. The DOM test harness also emits React act/deprecated punycode notices; these did not fail assertions. Initial harness runs exposed a missing synthetic Gym upload path and an assertion that omitted Next's locale prefix; both test issues were corrected before the passing runs.

## Security, preservation and handoff

Diff review found no remaining TG-C2 P0/P1 or implementation P2 issue: no public venue authorization source, no normal non-approved options, no automatic current-venue erasure, no metadata unlink, no Admin-owner mix-up, no ONLINE stale Gym, no forced Gym for independent Programs, no error fallback, no QA credentials in frontend, no backend/security changes and no unrelated redesign. P3 limitations are the documented inherited tooling/runtime notices and unrelated migration assertion. Browser evidence prepares manual sign-off; it does not grant that sign-off.

No source, documentation or Git history was changed in the backend. Backend HEAD remains `bb08174f51e90c44144ab1f79528a76d1d98b93f`. Neither `GymFlow` nor `GymFlow_dev` was mutated by TG-C2; writes were confined to disposable fixtures. Production was not connected. Live development access/session records were not used by the automated browser.

Protected SHA-256 values verified before edits and again during final review:

| File | Before = after |
| --- | --- |
| Frontend `public/locales/en/common.json` | `C57B28C4F5AF88E38688F1BFE3289710EEDA2E387C0F50E1A060BEBFD771502A` |
| Backend `docs/ai/COMPLETED_TASKS.md` | `A3800B213F112364D305C8FB4421E2994429C3A5BE05A529E49FBD3DDED5319F` |

The protected backend completion log was deliberately not updated; this frontend report records the work instead. Only TG-C2 frontend paths are to be staged for the single requested commit, `feat: restrict program gyms to approved access`. No push and no backend commit. The final response records the resulting commit hash and post-commit status.

Deferred: Admin Gym Access moderation UI; final manual TG-C2 visual QA; production cutover/deployment.
