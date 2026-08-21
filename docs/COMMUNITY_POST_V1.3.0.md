# Reddit draft — Raid Signal v1.3.0

Suggested title:

> [Showcase] Raid Signal v1.3.0: a Reddit request became automatic quest tracking

Suggested flair: `Showcase` plus the community-required AI-assisted disclosure,
if the subreddit UI permits both. Keep the disclosure in the body regardless.

---

Hi everyone,

The last two releases came directly from community contributions. This one came
from a community request.

Huge thanks to u/iShadowLTu, who noticed that Raid Signal already locates the
Tarkov log folder and asked whether it could recognize completed tasks, combine
that with the current profile, and automatically show objectives for active
tasks.

That request is now in Raid Signal v1.3.0.

The Windows desktop app can now read explicit quest **started, failed, and
completed** events from Tarkov-created logs. On first detection it does not
silently change anything: it opens a local review showing anonymized profiles,
game modes, event counts, skipped records, and any suspicious start bursts. You
choose whether to import.

After confirmation:

- active tasks can automatically place all of their objectives on the current
  map;
- Regular PvP, PvE, and Seasonal PvP progress stays separated by profile;
- the navigator follows the detected current profile/mode by default, while
  still allowing manual browsing;
- existing v1.2 manual quest progress is attached to the detected current
  profiles during the first backfill;
- later log events and manual corrections use a simple newest-event-wins rule;
- player level is optional and only helps label tasks as **possibly** available
  or locked;
- automatic log sync can be paused at any time.

Seasonal quest intelligence is included too, but I want to be precise about the
limit: the logs do not reliably expose every eligibility condition. Seasonal
tasks therefore stay “eligibility unknown” until an explicit supported event is
seen. Raid Signal also does not invent completion from prerequisite graphs,
trader standing, inventory, or character level.

Historical import can only recover events still present in your available log
files. It cannot reconstruct an old completion whose log has already been
deleted or rotated away.

The privacy boundary remains local-first:

- raw profile IDs are hashed before local storage;
- log contents, profiles, levels, and quest progress never go to the Internet
  relay, LAN relay, or phone companion;
- the phone companion still uses its own manual quest state;
- room protocol v1 and settings schema v2 remain compatible;
- the relay still forwards ciphertext only and stores no position history.

Nothing here reads game memory, injects input, automates gameplay, or modifies
game files. This is passive parsing of files Tarkov writes itself. That is not a
claim of BSG/BattlEye approval or an anti-cheat guarantee.

This release also carries forward the people who made the community loop real:

- u/TedCreator built the v1.1 foundation for displaying every objective from
  active quests;
- @Carbneth contributed the v1.2 loot categorization and filter UI;
- u/iShadowLTu supplied the v1.3 idea that connected log events to those active
  markers.

Thank you all. This is exactly what I hoped open-sourcing Raid Signal would lead
to: feedback becomes a scoped implementation, edge cases get reviewed in
public, and the result ships for everyone.

Download v1.3.0:
https://github.com/QTtrash/tarkov-map/releases/tag/v1.3.0

Website:
https://signal.mouchsiadis-solutions.com/

Source and implementation PR:
https://github.com/QTtrash/tarkov-map
https://github.com/QTtrash/tarkov-map/pull/19

The Windows installer remains unsigned, so Windows may show an
unknown-publisher warning. The release includes a SHA-256 checksum, manifest,
SPDX SBOM, Defender and ClamAV gates, and GitHub build provenance. These are
verification evidence, not a third-party security audit.

If your log preview misses a task or attributes something incorrectly, please
include the game mode, whether it was a started/failed/completed event, and a
small redacted log excerpt in a GitHub issue. Please remove account names,
profile IDs, and unrelated chat before posting logs publicly.

Discord: https://discord.gg/pz4QHAu9WN

AI-assisted development disclosure: AI tools were used during implementation,
testing, and drafting. The changes were reviewed against the public security and
quality contracts, and the code, tests, CI results, and release evidence are all
available in the repository.
