# Contributing

This project uses **GitHub Flow**: `main` is always releasable, and every change goes through a
short-lived branch and a pull request that must pass CI before it is merged.

## Branches

| Prefix      | Use for                              | Example                     |
| ----------- | ------------------------------------ | --------------------------- |
| `feat/`     | New features                         | `feat/kafka-outbox-relay`   |
| `fix/`      | Bug fixes                            | `fix/order-total-rounding`  |
| `ci/`       | CI/CD and GitHub configuration       | `ci/github-actions`         |
| `docs/`     | Documentation only                   | `docs/setup-guide`          |
| `test/`     | Tests only                           | `test/order-concurrency`    |
| `chore/`    | Tooling, dependencies, housekeeping  | `chore/bump-dependencies`   |
| `refactor/` | Code changes with no behavior change | `refactor/query-helpers`    |

Use lowercase words separated by hyphens.

## Workflow (PowerShell)

```powershell
# 1. Start from an up-to-date main
git switch main
git pull

# 2. Create a branch for the change
git switch -c feat/short-description

# 3. Work, then run the checks (from backend/)
npm run format:check
npm run lint
npm test

# 4. Commit and push the branch
git add <files>
git commit -m "feat: short description"
git push -u origin feat/short-description
```

Then open a pull request on GitHub. Use the link Git prints after the push, or the
**Compare & pull request** button on the repository page.

5. CI runs automatically on the pull request. Fix any failure by pushing more commits to the same
   branch.
6. When CI is green, merge with **Squash and merge**. Each change then lands on `main` as one
   commit with a conventional message.
7. Clean up:

```powershell
git switch main
git pull
git branch -d feat/short-description
```

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `type: description`, where type
is one of `feat`, `fix`, `test`, `docs`, `ci`, `chore`, `refactor`.

```
feat: add Kafka outbox relay
fix: reject orders for inactive products
ci: add backend test workflow
```

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request to `main` and every push to `main`:

1. Starts a throwaway PostgreSQL 17 database
2. `npm ci`, then Prettier and ESLint checks
3. Applies, fully reverts, and re-applies all migrations
4. Runs the full test suite
5. Audits production dependencies for known high-severity vulnerabilities

You can also start it manually from the **Actions** tab (**Run workflow**).

## Protecting `main` (one-time setup on GitHub)

Make CI mandatory so nothing reaches `main` without passing:

1. Repository → **Settings** → **Branches** → **Add branch ruleset** (or **Add rule**).
2. Target the `main` branch and enable:
   - **Require a pull request before merging**
   - **Require status checks to pass**, adding the check **Backend (lint, format, tests)**
     (it appears in the list after CI has run once)
   - **Block force pushes**
3. Optionally, under **Settings → General → Pull Requests**, allow only **squash merging** and
   enable **Automatically delete head branches**.
