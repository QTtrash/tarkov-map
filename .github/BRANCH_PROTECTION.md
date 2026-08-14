# Required GitHub repository settings

Configure a branch ruleset targeting `refs/heads/main`:

- active enforcement with repository administrators as emergency bypass only;
- block deletion and non-fast-forward pushes;
- require a pull request and resolved review conversations;
- require zero approving reviews while the project has one maintainer;
- require linear history and squash merge; disable merge commits;
- require these checks to pass on the latest commit:
  - `Repository policy`
  - `Required verification`
  - `Browser critical paths`
  - `Dependency review` for pull requests
  - `CodeQL`
  - `Full-history secret scan`
  - `Rust advisory audit`
- do not require signed commits initially.

Configure a second active ruleset targeting `refs/tags/v*` that blocks updates and
deletions, with the same administrator emergency bypass. Create a `release`
environment restricted to protected tags and require maintainer approval. Enable
private vulnerability reporting, immutable releases, secret scanning, and push
protection in repository settings.
