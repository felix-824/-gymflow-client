# TG-C1 Trainer Gym Access workspace

Implementation and QA evidence, November 3, 2026 (Asia/Seoul). This is frontend-only evidence, not production release approval or final human visual approval.

## Starting state and audit

- Frontend branch `modification`, HEAD `dc02471338c3e6bab1dd518d6e0554c7316ecb1b`. Only `public/locales/en/common.json` was modified; nothing staged.
- Backend branch `modification`, HEAD `ef2489a4465a755b04d6e2783bf3229ba845d8dc`. Only `docs/ai/COMPLETED_TASKS.md` was modified; nothing staged.
- Read frontend AGENTS.md, the sibling migration/decision/frontend/schedule/production-readiness documentation, current trainer components/styles/forms/Apollo/types/locales, and original `nestar-next/pages/mypage/index.tsx`.
- My Page remains the Pages Router controller at `/mypage?category=...`, with existing LayoutBasic, trainer workspace header, desktop links and fixed mobile navigation. The legacy MyMenu and mobile category fallback also get a trainer-only link. Direct navigation and reload retain `gymAccess`.
- Initial checks, including outside the sandbox, found neither port 3000 nor 3007 reachable. No normal backend was started. Local frontend QA used one owned frontend process at a time. Disposable API/Mongo test fixtures use separate loopback ports and their own databases, never application connection settings.

## Actual contracts

- `getMyTrainerGymAccesses(input: MyTrainerGymAccessesInquiry!)`: `page`, `limit` (1–100), `search` with optional `gymId`/`status`; newest-first `list` and `metaCounter`. The frontend uses combined paginated history and a separate latest-record read for the selected Gym.
- Owner selections: `_id`, `gymId`, `status`, `relationshipType`, `requestNote`, `rejectionReason`, `revocationReason`, `reviewedAt`, `revokedAt`, `createdAt`, `gymData { _id gymName }`. Owner Gym data contains no address/location; unavailable or inactive Gyms return null Gym data. No fabricated owner fields or Admin identities are displayed.
- `submitTrainerGymAccess(input: TrainerGymAccessInput!)`: `gymId`, `relationshipType`, trimmed `requestNote`, optional `previousAccessId`. No Trainer identity, role, status or moderation input is sent.
- Relationship enums: `WORKS_HERE`, `INDEPENDENT_TRAINER`, `FACILITY_PERMISSION`. Status enums: `PENDING`, `APPROVED`, `REJECTED`, `REVOKED`.
- Reapplication requires the latest REJECTED/REVOKED record's `previousAccessId`. The backend creates a new PENDING record. A latest-record read supplies this ID for both Request Again and a fresh form selecting a previously requested Gym.
- Existing public `GET_GYMS`/`GET_GYM` are reused. The service enforces ACTIVE Gyms. Search/pagination support the catalog; selected Gym identity includes its real location/address. `getMyApprovedGyms` was inspected but is not needed by this phase.
- Backend role, status, Gym eligibility, duplicate, history and transaction checks remain authoritative. No backend source, Program selector or Admin moderation operation was changed.

## Experience and access

- Only a restored ACTIVE TRAINER mounts the query/form and receives the Gym Access navigation destination. USER/ADMIN direct links show a harmless localized fallback. Guests and unresolved/error sessions have bounded session states. Owner/session changes unmount private content; late receipts cannot apply success feedback to another session.
- Restrained white surfaces, existing dark trainer header, coral actions, two columns at desktop, stacked cards at tablet/mobile. Combined server pagination is retained. Current (PENDING/APPROVED) and history (REJECTED/REVOKED) are grouped **for the displayed page**, with explicit page/count copy; no historical records are hidden by client slicing or rewritten.
- APPROVED explains GymFlow authorization for eligible in-person Programs while the Gym/authorization are active, without an employment-verification claim. PENDING says awaiting review without an ETA or cancellation action. REJECTED shows the exposed reason and new-request path. REVOKED shows date/reason and explains restricted new use while history remains.
- The inline request panel follows existing native form control conventions. Gym search/selection, relationship select, required textarea, trimmed 10–1000 validation, native `maxLength=1000`, raw-input character count, labeled errors and first-invalid-field focus are implemented. Notes start empty, including reapplications.
- Visible operational Gym choices are disabled with status labels. The selected Gym's latest access is fetched separately, so off-page operational duplicates are also blocked in the UI. Submission races remain server decisions.
- Synchronous lock plus mutation loading disable repeated submits and edits. Confirmed success closes/resets the form, refetches history, displays the new server PENDING record and uses the existing GymFlow toast. Server/uncertain failures preserve the draft and require reloading latest access before retry; server details are not rendered.
- Loading skeletons precede empty-state evaluation. History errors stay within the shell and offer retry. Gym search and selected-access errors have local recovery. Missing/inactive Gym history remains visible without suggesting an unavailable reapplication.
- Headings, labels, native select/textarea/details, semantic buttons, status text, focus outlines and touch targets are present. Cancel returns focus after React re-enables the request action. This is inline UI; modal Escape/focus-trap behavior is not applicable. Final screen-reader/device/manual QA remains deferred.
- Shared navigation accommodates six trainer destinations. Tablet links wrap onto their own row; mobile columns share available width. Long names/reasons/notes wrap and input/form widths stay within the viewport.
- EN/KR/RU use new `trainer-gym-access.json` namespaces plus the existing `gyms` namespace. My Page loads/reloads these using its established next-i18next convention. Protected EN common.json is untouched.

## Files

Created:

- `libs/components/mypage/TrainerGymAccess.tsx`
- `libs/enums/trainer-gym-access.enum.ts`
- `libs/types/trainer-gym-access/trainer-gym-access.ts`
- `libs/trainer-gym-access.ts`
- `public/locales/{en,kr,ru}/trainer-gym-access.json` (three files)
- `scss/pc/mypage/trainerGymAccess.scss`
- `scripts/test-trainer-gym-access.cjs`
- `scripts/test-trainer-gym-access-browser.cjs`
- This report.

Modified:

- `apollo/user/query.ts`, `apollo/user/mutation.ts`: two owner operations only.
- `pages/mypage/index.tsx`: category, namespaces and mobile fallback.
- `libs/components/layout/LayoutBasic.tsx`: existing trainer shell selection.
- `libs/components/mypage/TrainerWorkspaceNavigation.tsx`, `MyMenu.tsx`: trainer destination.
- `scss/pc/main.scss`: scoped stylesheet import.
- `scripts/test-trainer-application.cjs`: existing namespace assertion updated to include new My Page namespaces; its loader is otherwise unchanged.

No dependency, lockfile, environment file or backend change is included.

## Validation

Use installed Node 22.13.0 and Yarn 1.22.22. Commands below are frontend-relative.

| Command | Result |
| --- | --- |
| `yarn typecheck` | Passed after the contract and UI phases; explicit final check also run. |
| `yarn node scripts/test-trainer-gym-access.cjs --integration` | 46 checks passed: 43 helper/real React/MUI/Apollo checks plus three isolated integration groups. Includes off-page duplicates, paging and late-session receipts. All **69** current frontend GraphQL documents validated against the real generated Nest schema. |
| `yarn node scripts/test-trainer-gym-access.cjs` | 43 checks passed again after the browser-discovered focus fix. |
| `yarn test:integration` | Nine existing disposable integration groups passed: auth, profile, Program CRUD/validation/ownership, discovery/trainers/engagement, management, articles/follows, uploads and Admin/role/expired-session enforcement. |
| `yarn node scripts/test-trainer-dashboard.cjs` | Four existing helper/locale groups passed. |
| `yarn node scripts/test-admin-workspace.cjs` | Ten existing DOM/navigation/profile/access groups passed. |
| `yarn node scripts/test-trainer-schedule.cjs` | 11 existing schedule DOM/form checks passed. |
| `yarn node scripts/test-trainer-reservations.cjs` | Five existing reservation helper/locale groups passed. |
| `yarn node scripts/test-gym-catalog.cjs` | 33 existing catalog DOM/query/layout/style groups passed. |
| `yarn node scripts/test-gym-detail.cjs` | 54 existing detail DOM/query/race/gallery/card/style groups passed, including existing Program/Trainer links and global mobile navigation. |
| Targeted `yarn lint --no-cache --file ...` | All changed TypeScript files passed with existing shared-file warnings. New implementation files pass without warnings. |
| `yarn lint --no-cache --dir libs --dir apollo` and `--quiet` | Blocked by four existing errors in untouched `libs/components/common/ScrollControls.tsx`: three missing display names and one deprecated ReactDOM.render. |
| `yarn test:migration` | Nine checks passed before an existing Admin Users source-format regex failed because `inputProps` is no longer the first OutlinedInput attribute. Both the assertion and Admin Users source are unchanged by TG-C1. |
| `yarn node scripts/test-trainer-application.cjs` | First four contract/namespace/loading/locale checks passed, then an existing loader failed resolving `admin-workspace.json` as `.json.tsx`. No loader or unrelated profile fix was added. |
| `yarn check:graphql` | Live command unavailable: localhost:3007 did not respond. Equivalent validation of all 69 documents passed against the isolated current Nest schema above. |
| `yarn build` | Production build passed; final source rebuilt after focus fix. Explicit placeholder public HTTPS URLs are for local artifact validation, not deployable production configuration. |

Browser command:

```powershell
$env:GYMFLOW_QA_PLAYWRIGHT = '<existing Playwright package path>'
$env:GYMFLOW_QA_BROWSER = '<existing Edge executable path>'
$env:GYMFLOW_QA_URL = 'http://127.0.0.1:3000'
yarn node scripts/test-trainer-gym-access-browser.cjs
```

The harness launches headless Edge against a local Next frontend. Every GraphQL request, including synthetic session restoration, is intercepted; unexpected operations are blocked. It performs no submission or real account/DB writes. All three locales pass history and request-form geometry at **1440/768/390**, with long names, reasons and notes, direct URL reload, visible focus, Cancel focus return, six navigation links and usable touch targets. Mobile empty/error/loading states and USER/ADMIN fallback also pass: **21 captures**. Full-page screenshots and metrics are emitted to an owned temporary `gymflow-gym-access-browser-*` directory.

Desktop/mobile screenshots were inspected by the agent. Automated geometry and these captures do not establish final human visual approval, real application-session QA or physical-device/screen-reader coverage. Development notices include the inherited font stylesheet location, existing Autoprefixer warning and a Next HMR `isrManifest` message. Final production-mode confirmation passed the same 21 captures and USER/ADMIN checks, with zero browser console notices, zero uncaught page errors and zero unexpected operations. Its screenshots/metrics are at `C:\Users\lenovo\AppData\Local\Temp\gymflow-gym-access-browser-dYuX1E`. Repeated captures are not added to the unique 21-case total. All owned frontend QA processes were stopped after verification.

## Review, preservation and remaining work

- No P0/P1 issue remains in the reviewed TG-C1 diff. No fixture IDs exist in application implementation; test-only IDs remain confined to harnesses. No Admin IDs/raw exceptions are displayed, no historical record is locally mutated, and client role gating never replaces server authorization. Program create/edit/selector and backend security remain unchanged.
- P2: unrelated broad regression/lint harness failures and unavailable live backend remain as listed. The existing large My Page translation payload warning remains; loading feature/Gym namespaces adds data to that payload. Namespace/code splitting was not expanded into this phase.
- P3: inherited font/image/link lint warnings, workspace-root/multiple-lockfile warning, Autoprefixer/cache notices, dependency `punycode` deprecation and development HMR notices. No unrelated cleanup was included.
- No GymFlow or GymFlow_dev data was modified. Isolated fixture writes were restricted to owned disposable test databases. No production-environment startup, migration, provisioning, deployment or push occurred. Backend HEAD remains unchanged; backend completion log remains the user's pre-existing modification.
- Frontend protected EN common.json SHA-256 before/after: `C57B28C4F5AF88E38688F1BFE3289710EEDA2E387C0F50E1A060BEBFD771502A`.
- Backend protected COMPLETED_TASKS.md SHA-256 before/after: `A3800B213F112364D305C8FB4421E2994429C3A5BE05A529E49FBD3DDED5319F`.
- Scoped diff whitespace checks pass. The pre-existing protected EN whitespace modification is intentionally excluded and preserved.
- Intended commit: `feat: add trainer gym access workspace`, frontend only. Final commit hash and final Git/staging states are provided in the task response after commit.
- Deferred: Program approved-Gym selector, Admin Gym Access moderation UI, final manual visual QA, actual restored-session verification against the unavailable development API, physical-device/screen-reader checks. Other requested scope exclusions remain deferred.
