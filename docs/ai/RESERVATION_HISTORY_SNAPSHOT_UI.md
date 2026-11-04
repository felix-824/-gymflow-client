# Reservation history venue snapshots

November 4, 2026 (Asia/Seoul). Scope: the closed TrainerGymAccess audit's P2 history presentation finding only.

## Change

The backend already stores an immutable booking-time `venueSnapshot`, but both frontend history queries omitted it and both views rendered the current Program's venue. A later Program move could therefore change the apparent venue of an earlier reservation.

Inspected `gymflow/apps/gymflow-api/src/libs/dto/reservation/reservation.ts` before implementation. The existing GraphQL contract is sufficient: nullable `venueSnapshot`, nullable String `gymId` and `gymName`, non-null `ProgramLocation` `programLocation`, and non-null String `programAddress`.

- `apollo/user/query.ts`: select those four fields in `GET_MY_RESERVATIONS` and `GET_TRAINER_RESERVATIONS` only.
- `libs/types/reservation/reservation.ts`: represent the readonly snapshot with the backend's nullability; Trainer reservations inherit it through the existing type.
- `libs/components/mypage/MyBookings.tsx` and `TrainerReservations.tsx`: render the captured Gym name, localized location and applicable physical address independently of current Program data. Null snapshots show unavailable copy with no current-Program venue fallback. Independent venues need no Gym. An ONLINE snapshot omits a physical address; a current ONLINE Program does not hide a captured physical venue.
- `public/locales/{en,kr,ru}/reservation-venue.json` and `pages/mypage/index.tsx`: add/load a small namespace for unavailable copy without editing protected common translations.
- `scripts/test-reservation-venue-snapshot.cjs`: focused real-component/Apollo/i18next checks using controlled transport, without HTTP or database access.
- `scripts/test-my-bookings.cjs`: replace the obsolete legacy current-Program location assertion with localized unavailable-venue assertions after an actual refetch.

Current Program titles, images and type metadata remain current metadata. Reservation actions, authentication, creation, authorization and persistence are unchanged. No snapshot backfill or fabricated historical values were introduced.

## Validation

| Command | Result |
| --- | --- |
| `yarn node scripts/test-reservation-venue-snapshot.cjs` | PASS: 33 checks, both roles and EN/KR/RU |
| `yarn node scripts/test-booking.cjs --integration` | PASS: 19 checks |
| `yarn node scripts/test-my-bookings.cjs --integration` | PASS: 23 checks |
| `yarn node scripts/test-trainer-reservations.cjs --integration` | PASS: 20 checks |
| `yarn check:graphql` | PASS: all 74 documents against read-only local schema introspection |
| `yarn typecheck` | PASS after implementation and in final validation |
| Scoped lint on the five changed TypeScript/TSX files | PASS; two inherited MyBookings image warnings |
| Isolated frontend production build | PASS: 105 static pages, exit 0; existing image/font/CSS, workspace-root, i18next and large-page-data warnings remain |

Focused cases cover Gym A snapshot versus current Gym B, null snapshots, nullable Gym fields/independent rooms, missing current Program summaries, current ONLINE Programs with physical snapshots, and ONLINE snapshots. Rendering dispatches no mutations. Existing integration suites use only owned disposable loopback replica sets; no normal API startup, application environment loading or application database mutation was performed.

The build uses an owned temporary source copy, a separate `.next` output directory, no copied `.env` files, and reserved example API URLs. Existing development servers are preserved.

## Protected state and scope

Both repositories started on `modification` with empty staging. Frontend parent: `6e3a93e45102fbf69eeeac5e2828226989b44209`; backend HEAD remains `1829d9445485f695aa5e8304c8345c6ee5f6becb`.

Protected file SHA-256 values were verified before implementation and again during validation:

- Frontend `public/locales/en/common.json`: `C57B28C4F5AF88E38688F1BFE3289710EEDA2E387C0F50E1A060BEBFD771502A`.
- Backend `docs/ai/COMPLETED_TASKS.md`: `A3800B213F112364D305C8FB4421E2994429C3A5BE05A529E49FBD3DDED5319F`.

Neither protected modification is staged or committed. The backend completion log is deliberately preserved; this frontend note records the work instead. No backend edits/commit, GymFlow_dev mutation, production access, migration, backfill, seed, push or deployment. The P3 Admin locale/static-page-data warning remains deferred as requested.
