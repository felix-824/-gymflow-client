# GymFlow frontend

Next.js 14 Pages Router frontend migrated from Nestar. React 18, TypeScript, Apollo Client, MUI, SCSS and next-i18next remain in place.

Use Yarn. Development configuration points to the GymFlow GraphQL API at http://localhost:3007/graphql.

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

For broader lint coverage run `yarn lint --no-cache --dir libs --dir apollo`. Four pre-existing errors remain in the unchanged common/ScrollControls.tsx implementation; the default Pages lint passes with warnings. Desktop/mobile visual verification still needs an available browser environment.

Read AGENTS.md and ../gymflow/docs/ai before changing functionality. Booking, schedules, payments and program/trainer reviews are outside the current scope.
