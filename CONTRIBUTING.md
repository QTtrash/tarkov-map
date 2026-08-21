# Contributing to Raid Signal

Thank you for improving Raid Signal. By submitting a contribution, you agree
that your contribution is licensed under Apache-2.0 and that you have the right
to provide it. Do not add map artwork or game-derived data without documented
provenance and redistribution terms.

## Development setup

Install Node 22.23, npm 11.14, Rust 1.93 with Rustfmt and Clippy, and the current
[Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/).

```text
npm ci
npm --prefix relay ci
npm run check:all
```

Use `npm run dev` for the browser preview and `npm run tauri:dev` for native
behavior. Playwright requires `npx playwright install chromium` once locally.

## Pull requests

- Open focused pull requests and keep behavior changes separate from formatting.
- Use a Conventional Commit title such as `fix(relay): reject malformed paths`.
- Explain motivation, implementation, compatibility, security/privacy effects,
  tests, and screenshots for visible changes.
- Add regression tests and update current architecture or security documentation
  when an invariant changes.
- Run `npm run check:all` before requesting review.

Commits are squash-merged. The pull-request title becomes the public commit.
Generated files, installers, credentials, production environment files, and
unattributed assets will not be accepted.
