Go outside of this project and read gymflow/docs/ai first!

# GymFlow Frontend Modification Instructions

This client project is being migrated from nestar-next to gymflow-next.

## Rules

- Preserve current project architecture
- Keep GraphQL/Apollo integration
- Do not rewrite the whole app
- Improve UI incrementally

## Backend Context

Before making any changes, read:

- docs/ai/BACKEND_MIGRATION.md
- docs/ai/DECISIONS.md
- docs/ai/FRONTEND_MIGRATION.md
- And other relevant documentation inside gymflow/docs/ai

## Workflow

1. Analyze before editing.
2. Backend is running at http://localhost:3007/graphql now.
3. Make small incremental changes.
4. Run typecheck after each phase.
5. Do not remove working logic unless replaced safely.
6. Update gymflow/docs/ai/COMPLETED_TASKS.md after major changes.

## Package Manager

- Use Yarn for all frontend commands.
- Do not use npm or pnpm.
- Install dependencies with: 

```bash
yarn install
```
## Coding Style and Implementation Consistency

- Follow the original nestar-next frontend coding style.
- Inspect the corresponding nestar-next implementation before making changes.
- Preserve the existing Next.js architecture and folder structure.
- Maintain established React components, hooks, state management, and event handlers.
- Follow existing TypeScript types, interfaces, and naming conventions.
- Preserve GraphQL/Apollo Client query and mutation patterns.
- Maintain existing async/await and error-handling conventions.
- Do not introduce unnecessary dependencies or new architectural patterns.
- Adapt Nestar functionality to GymFlow's Program and TRAINER domain.
- Keep changes small and incremental.
- Run typecheck after each implementation phase.
- Do not modify unrelated files.