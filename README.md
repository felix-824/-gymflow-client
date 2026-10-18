# GymFlow frontend

Next.js 15.5.28 Pages Router frontend migrated from Nestar. React 18, TypeScript, Apollo Client, MUI, SCSS and next-i18next remain in place.

Use Node 22.x and Yarn 1.22.22 with the committed yarn.lock. Development configuration defaults to the GymFlow GraphQL API at http://localhost:3007/graphql.

For production environment values, exact install/build/start commands, routing, backups, rollback, and the release gates, use the canonical [release readiness runbook](../gymflow/docs/ai/PRODUCTION_READINESS.md). Set both public API URLs before building; changing runtime variables alone does not update the browser bundle. The examples in .env.example are placeholders.

```sh
yarn dev
yarn tsc --noEmit --incremental false
yarn check:graphql
yarn test:migration
yarn test:integration
yarn lint --no-cache
yarn build
```

Public routes: /program, /program/detail?id=..., /trainer and /trainer/detail?trainerId=.... Trainer management remains under /mypage; administrative program management is /_admin/programs.

GraphQL validation only reads the local schema. Migration unit checks exercise URL parsing, form payloads and session restoration. The disposable integration suite creates an isolated MongoDB/server using the sibling gymflow backend dependencies; it never uses the application database.

The integration runner requires the sibling backend dependencies and its existing MongoDB 8.2.6 binary cache at ../gymflow/.tmp/mongodb-binaries. Automatic binary downloads are disabled. Upload fixtures are written to an owned temporary directory and cleaned up.

For broader lint coverage run `yarn lint --no-cache --dir libs --dir apollo`. Inherited lint debt is separate from the bounded release checks. Final desktop/mobile browser QA must be recorded against the deployed release.

Read AGENTS.md and ../gymflow/docs/ai before changing functionality. Current flows include trainer schedules, bookings, trainer reservation transitions, and completed-reservation reviews. Payments, Chat, and full notification delivery remain outside this release scope.
