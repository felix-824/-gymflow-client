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


## Git Commit Workflow

- Automatically create Git commits after completing each small, logical change.
- Do not wait for me to remind you to commit.
- Use only `feat:` and `fix:` commit prefixes.
- Keep commit messages short, natural, and descriptive.
- Do not combine unrelated changes into a single commit.
- When modifying multiple pages, components, or folders, create separate commits for independently completed changes.
- For large tasks, divide the implementation into smaller logical steps and commit each completed step.
- Do not create unnecessary commits for whitespace, comments, or meaningless changes.
- Before each commit, review `git diff` and stage only files related to that change.
- Run relevant checks before committing whenever possible.
- Do not commit broken or incomplete functionality.
- Never use `git add .` or `git add -A` without reviewing all changes.
- Never amend, reset, rebase, or force-push existing Git history without my approval.
- Do not push commits to GitHub unless I explicitly request it.
- After completing a task, report the commits you created.