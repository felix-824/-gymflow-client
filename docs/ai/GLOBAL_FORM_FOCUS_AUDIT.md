# Global form focus audit and fix

November 4, 2026, Asia/Seoul. Styling/accessibility scope only.

## Starting state

Both branches: `modification`. Frontend HEAD: `ad7e6b51877e1854d971422a8df264769d98a8a9`. Backend HEAD: `bb08174f51e90c44144ab1f79528a76d1d98b93f`. Staging was empty in both repositories. Only the protected frontend EN common JSON and backend completion log were already modified.

Read AGENTS.md and sibling migration/decisions/frontend migration/current production-readiness documentation first. Compared the incumbent Nestar app/theme, account, profile and editor styling. Preserved Pages Router, MUI/Emotion, the existing theme providers and SCSS architecture. Impeccable context launcher was unavailable because its engine/cache was not installed; used actual project source and browser evidence. No product/design context file was invented.

## Root causes and audited families

The recurring effect has multiple paint owners, not a Gym Access business-logic defect:

1. Page-wide `:focus-visible` rules add an outside outline without replacing the native field's neutral border. This directly explains Trainer Gym Access search/select/textarea, Trainer Application, schedule, booking/review and several workspace controls.
2. Outlined MUI fields already draw their focused notched fieldset. Generic page rings on the inner input or Select div can add a second boundary. Admin Programs/Community Select rules explicitly did this; public Program discovery already had a local workaround.
3. Auth inputs combine a colored border with a separate translucent outside halo. Composite profile/search/number controls assign focus to wrappers while descendants can independently inherit generic rings. Trainer profile also used a soft shadow as its sole wrapper indicator.
4. Header global search intentionally uses standard MUI fields with `disableUnderline` and a custom pseudo-element underline. Its short coral segment and mobile neutral rule need one continuous, visible underline rather than a second fieldset or generic ring.

| Surface audited in actual source | Control family / disposition |
| --- | --- |
| Login/Register | Native text/password/tel; shared native inset edge replaces auth halo |
| Public Programs filters/search, homepage search | Outlined MUI fields/selects; fieldset owns focus |
| Header global Program search | Standard MUI with custom underline; retained one stronger continuous underline |
| Gyms/Trainers search | Borderless input in custom wrapper; wrapper owns focus |
| Public Gym sort/filters, Community/help | Native select/textareas, checkbox filters, help search wrapper; text controls covered, checkbox/button focus retained |
| USER/TRAINER profile, Admin profile | Existing shared profile components and composite/native fields; wrapper/native owner as appropriate |
| Trainer Application | Native text/textarea; inset edge, invalid-state color retained |
| Trainer Gym Access/request form | Native search/select/textarea; gray edge replaced by coral at focus |
| Program Create/Edit, approved Gym selector | Native text/select/textarea and number wrapper; one owner, no dimensions changed |
| Schedule | Native time inputs; inset focus, existing disabled/error behavior retained |
| Reservations/bookings/reviews | MUI filters, native textarea and review wrapper; non-text status/rating controls retain their existing focus treatments |
| Community authoring/comments | Native title/textareas covered; rich text editor focus retained separately |
| Admin Users/Trainer Applications/Gym Access | Outlined inputs/selects and dialog textareas; fieldset owns focus |
| Admin Programs/Gyms/Community | Outlined filters/selects, Gym editor fields and opening-hours inputs; same MUI owner |
| Admin dialogs/modals and pagination | Portal-rendered outlined controls covered globally; borderless pagination Select retains its existing single indicator |

Also inspected inline `sx`/Emotion styling and shared MaterialTheme definitions. No active component adds another inline text-field ring requiring a React change. The unused legacy `RedditTextField` export is not rendered by current routes and was left unchanged. Rich text, file inputs, sliders, color inputs, switches, radios, checkboxes, buttons, links and their intentional indicators are outside the native text selector.

## Exact changes and ownership

- Created `scss/form-focus.scss`: one shared policy with separate native, outlined MUI and composite wrapper selectors; error and forced-colors handling.
- Modified `scss/app.scss`: imports that policy through the established global SCSS entrypoint, including portal controls.
- Modified `scss/global-program-search.scss`: two local underline declarations, retaining the existing standard/underline design instead of forcing it into an outlined-field selector.
- Created `scripts/test-form-focus-browser.cjs`: intercepted browser/state regression matrix.
- Created this report, `docs/ai/GLOBAL_FORM_FOCUS_AUDIT.md`.

The small set of `!important` focus declarations deliberately resolves competing high-specificity legacy page selectors in one location. It does not reset general elements or restyle non-text controls. MUI and native controls use separate selector families. No component, route, query, mutation, authentication/authorization, business helper, dependency, backend, production configuration, seed or fixture file changed.

## Before / after and accessibility

Normal and hover styles remain as authored. A native field's focused border and 2px inset outline use the same existing GymFlow dark coral `#a53425`, producing one continuous edge over the old neutral border without changing border width or layout. Unlike the prior outside ring, it leaves no gray inner boundary or gap. Outlined MUI controls suppress only inner/root duplicate rings and use their existing focused fieldset; MUI's error red remains distinct. Composite controls suppress only their inner text-control ring and draw the same inset boundary on the wrapper.

Native invalid controls retain a distinct error edge (`aria-invalid` and browser user-invalid); helper/error semantics remain unchanged. Disabled controls are excluded from the native focus rule and cannot acquire keyboard focus. Read-only controls retain a visible focus boundary when focusable. Hover styling, dimensions, label notches, control values and event handlers are unchanged. Existing non-text focus treatments are preserved.

Keyboard Tab/Shift+Tab remains visible. Inset indicators are 2px and use a darker existing coral than the low-opacity auth halo. Forced-colors mode uses system `Highlight`/`CanvasText`, with a system-color pseudo-element for the intentionally underlined header search. No global blanket `outline: none` was added: suppression is limited to an inner MUI/wrapper control whose visible owner supplies the boundary.

## Browser evidence

The harness uses installed Edge/Playwright against the existing local frontend. Every GraphQL operation, including session bootstrap, is intercepted. Unexpected reads and all application writes are blocked; no live login or application database is used. Temporary invalid/disabled/read-only DOM states exercise styling on real rendered controls, then are restored; they do not submit forms or change application data.

Baseline measurements/captures identified auth, native, wrapper and MUI behavior. Early baseline harness failures were incorrect registration/textarea selectors, serializing a setup callback, and native Select popup handling; these were corrected. The frontend briefly refused connections during baseline capture; an available healthy listener was reused without starting a duplicate server.

The first post-fix matrix found a selector-specificity issue in the composite inner reset. Corrected that shared selector once. An empty Admin Gym name correctly became invalid on blur; the assertion now requires its error red rather than incorrectly demanding coral. No assertion was removed or existing product regression weakened.

Representative confirmation covers 21 page/control cases at each of 1440/768/390: Login, Register, Program Create, number wrapper, Program Edit/Gym select, Trainer Gym Access request search, Trainer Application text and textarea, Trainer/USER profile wrappers, schedule time, Admin Gym Access filters, Admin Gym Create/Edit/textarea, Admin Program Select, public Program search, public Gym/Trainer search, help wrapper and header standard-MUI search.

Each case measures normal, hover, pointer focus, keyboard focus, invalid state where supported, disabled/read-only where applicable, and forced colors. Assertions cover boundary ownership/color, duplicate-shadow removal, keyboard visibility and unchanged focus dimensions. Screenshots include surrounding pixels so a second outside ring would remain visible.

The non-native Admin MUI Select is focused after pointer hover without opening its popup; actual pointer clicks are exercised on outlined text inputs and native controls. Keyboard Tab/Shift+Tab exercises the Select's real focus target as well. Error/disabled/read-only simulation is a styling check, not a new claim about application validation or permissions.

Final confirmation: **63/63 passed**, 21 each at **1440, 768 and 390**, with zero page errors or unexpected operations. Artifacts and per-state computed measurements: `C:\Users\lenovo\AppData\Local\Temp\gymflow-focus-after-ZI9sUl`. Visually inspected representative desktop number/Register, tablet Admin Gym, and mobile profile/Gym Access/header-search captures after the shared correction. Each showed one boundary; no further visual edits were needed. Edge viewport emulation and forced-colors emulation were used; physical devices and other browser engines were not tested.

## Validation

All commands use Yarn 1.22.22 / installed Node 22.13.0. Counts are the suites' own check/group counts, not an aggregate of unique tests.

| Command | Result |
| --- | --- |
| `yarn node scripts/test-form-focus-browser.cjs` | 63/63 page/viewport cases passed, 346.80s; keyboard, state, dimension and forced-color assertions passed |
| `yarn node scripts/test-program-form-controls.cjs` | 59 passed |
| `yarn node scripts/test-trainer-gym-access.cjs` | 43 TG-C1 checks passed |
| `yarn node scripts/test-program-approved-gyms.cjs` | 21 TG-C2 checks passed, including disposable backend checks |
| `yarn node scripts/test-admin-gym-access.cjs` | 39 TG-C3 checks passed |
| `yarn node scripts/test-admin-trainer-applications-responsive.cjs` | 12 passed |
| `yarn node scripts/test-admin-programs-responsive.cjs` | 14 passed |
| `yarn node scripts/test-admin-gyms.cjs` | 87 contracts/helpers; 39 list; 29 control; 46 editor groups; 4 disposable backend groups passed |
| `yarn node scripts/test-admin-community-responsive.cjs` | 14 passed |
| `yarn node scripts/test-admin-users.cjs` | 15 passed |
| `yarn node scripts/test-admin-workspace.cjs` | 10 passed |
| `yarn check:graphql` | 74 documents passed; read-only schema introspection |
| `yarn typecheck` | Passed, 74.77s |
| `yarn lint --no-cache --file scripts/test-form-focus-browser.cjs` | Passed; no ESLint warnings/errors |
| `yarn prettier --check scss/form-focus.scss scripts/test-form-focus-browser.cjs` | Passed |
| `yarn node C:\Users\lenovo\AppData\Local\Temp\gymflow-focus-build.cjs` | Production build passed, 375.81s; 105 static pages generated |

Build uses the owned temporary source copy `C:\Users\lenovo\AppData\Local\Temp\gymflow-focus-build-Cza8sD`, reuses dependencies/public assets, copies no `.env`, sets placeholder HTTPS API build URLs and leaves the active frontend `.next` untouched. Disposable backend regression fixtures never use application connection settings. No `GymFlow` or `GymFlow_dev` data was touched.

## Findings and preservation

Review found no new remaining P0/P1/P2 issue in this change. P3 follow-ups are existing repository/tooling notices and the unused legacy filled-field export, which is not rendered by current routes. Notices include the deprecated Next lint command, multiple-lockfile workspace-root detection, parent package license notice, legacy image/font/link warnings, MUI DOM harness notices, existing large-page-data advisories, and the existing Prettier configuration's unknown `extends` option. Browser console notices included existing Next stylesheet/legacyBehavior/HMR diagnostics and an i18next initialization warning; the page-error list was empty. The previously documented unrelated `test:migration` Admin Users JSX prop-order assertion was not rerun for this styling-only task; neither its assertion nor unrelated source was modified.

Protected SHA-256 before = after (rechecked at final review):

| Protected file | SHA-256 |
| --- | --- |
| Frontend `public/locales/en/common.json` | `C57B28C4F5AF88E38688F1BFE3289710EEDA2E387C0F50E1A060BEBFD771502A` |
| Backend `docs/ai/COMPLETED_TASKS.md` | `A3800B213F112364D305C8FB4421E2994429C3A5BE05A529E49FBD3DDED5319F` |

The protected backend completion log remains unchanged; this frontend report records the task. Only the five task files listed above belong in the commit `fix: unify form focus states`. Completion Git state, verified after commit in the final response: frontend has only ` M public/locales/en/common.json`; backend has only ` M docs/ai/COMPLETED_TASKS.md`; both staging areas are empty; backend HEAD is unchanged. The final response supplies the frontend commit hash. No push or deployment.
