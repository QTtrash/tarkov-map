# Required GitHub repository settings

Configure a branch ruleset targeting `refs/heads/main`:

- active enforcement with repository administrators as emergency bypass only;
- block deletion and non-fast-forward pushes;
- require a pull request and resolved review conversations;
- require zero approving reviews while the project has one maintainer;
- require linear history and squash merge; disable merge commits;
- require contributors to record local `npm run check:all` results in the pull
  request; there are no repository-defined Actions checks to require;
- do not require signed commits initially.

Configure a second active ruleset targeting `refs/tags/v*` that blocks updates and
deletions, with the same administrator emergency bypass. Releases are published
manually by the maintainer following `docs/RELEASING.md`; the former Actions
`release` environment no longer gates publication. Enable
private vulnerability reporting, immutable releases, secret scanning, and push
protection in repository settings.

## Follow-up for existing repositories

Deleting repository files does not change GitHub settings. Remove the obsolete
required checks from existing branch protection and rulesets: `Repository policy`,
`Required verification`, `Browser critical paths`, `Dependency review`, `CodeQL`,
`Full-history secret scan`, and `Rust advisory audit`. Otherwise pull requests may
remain blocked waiting for checks that no longer run.

Review GitHub settings separately to disable Actions and Dependabot security
update automation if enabled, including any independently configured code scanning.
Removing `dependabot.yml` removes the scheduled version-update configuration;
it does not disable GitHub-side security updates or alerts. Keep vulnerability
reporting and security alerts available. These settings changes are not performed
by this repository change.
