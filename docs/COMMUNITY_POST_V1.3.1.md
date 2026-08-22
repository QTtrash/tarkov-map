# Reddit draft — Raid Signal v1.3.1 compatibility call

Suggested title:

> [Feedback] Raid Signal v1.3.1 improves quest-log diagnostics — can current players help map Tarkov's event format?

Suggested flair: `Feedback` or the closest available community flair, plus the
required AI-assisted disclosure in the body.

---

Hi everyone,

I owe you a transparent update about the automatic quest-tracking experiment
requested by u/iShadowLTu.

Raid Signal v1.3.0 implemented a careful importer for an observed Tarkov quest
notification structure: explicit started, completed, and failed records, a
review before import, hashed local profile IDs, and no progress inferred from
quest chains or random identifiers.

Testing against retained logs from the current Tarkov build found an important
compatibility gap: those logs contain quest lifecycle traces, but not the
`ChatMessageReceived` records with safely attributable task IDs that v1.3.0
recognizes. The app correctly imported nothing—but it did a poor job explaining
that, and the public wording sounded more universal than the evidence supported.

v1.3.1 corrects that.

What is new:

- notification and output logs are both scanned instead of one suppressing the
  other;
- duplicate events across sources are still collapsed;
- Settings now separates the configured Logs root from the currently active
  `log_*` session;
- folder rescan, quest-log scan, import success, disabled import, and errors all
  have visible feedback;
- zero-event results explain that the retained logs may contain no quest
  transition or may use an unsupported format;
- **Copy Diagnostics** produces counts and compatibility categories only—no
  paths, profile IDs, timestamps, fingerprints, or log contents;
- ambiguous `AcceptQuest`, completion/failure stack traces, and unrelated
  24-character IDs remain diagnostic hints only. They are never promoted into
  quest progress.

Automatic quest-log import is therefore explicitly **experimental**. Manual
quest tracking and objective markers continue to work, and older recognized
records remain supported, but I will not claim current-format automatic tracking
until it is demonstrated with a trustworthy event fixture.

This is where I could use community help.

If you can accept, complete/turn in, or fail a quest on the current Tarkov build
today:

1. install Raid Signal v1.3.1;
2. perform one of those quest actions normally;
3. open **Quest Navigator → Review Log Import**;
4. choose **Copy Diagnostics**;
5. paste that counts-only summary into the dedicated compatibility form:

https://github.com/QTtrash/tarkov-map/issues/new?template=quest_log_compatibility.yml

Please do **not** attach or paste raw Tarkov logs. They may contain account
details, profile IDs, tokens, IP addresses, Windows paths, and chat. If a report
shows a useful structural lead, I will provide a local sanitization workflow so
the contributor can review the minimal redacted structure before sharing it.

The safety boundary has not changed: Raid Signal does not read game memory,
inject input, automate play, modify game files, or send logs/quest state to the
relay. This is not a claim of BSG/BattlEye approval or an anti-cheat guarantee.

Thank you again to:

- u/iShadowLTu for the automatic-tracking idea and the push to investigate it;
- u/TedCreator for the v1.1 active-objective foundation;
- @Carbneth for the v1.2 loot categorization and filters;
- everyone willing to test the experiment carefully instead of hiding an edge
  case behind marketing.

Download v1.3.1:
https://github.com/QTtrash/tarkov-map/releases/tag/v1.3.1

Website:
https://signal.mouchsiadis-solutions.com/

Source:
https://github.com/QTtrash/tarkov-map

Discord:
https://discord.gg/pz4QHAu9WN

The Windows installer is unsigned, so Windows may show an unknown-publisher
warning. The release includes a SHA-256 checksum, manifest, SPDX SBOM, Defender
and ClamAV gates, and GitHub build provenance. These are verification materials,
not a third-party security audit.

AI-assisted development disclosure: AI tools were used during implementation,
testing, investigation, and drafting. The code, tests, CI results, review
history, and release evidence are public.
