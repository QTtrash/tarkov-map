# Reddit draft — Raid Signal v1.4.0

This is a generic cross-post draft. Before publishing, choose the title and
flair that best fit each community's rules, remove any sections that are not
relevant there, and avoid posting the same wording repeatedly in a short period.

Suggested titles:

> [Release] Raid Signal v1.4.0 — squad and quest markers in the compact overlay

> [Tool] Raid Signal v1.4.0 adds candidate quest locations and a live squad overlay

> Raid Signal v1.4.0: a privacy-focused second-screen map and native overlay for Tarkov

Suggested flair: `Tool`, `Guide`, `Release`, or the closest available
community flair. Include the AI-assisted disclosure in the body wherever a
community requires it.

---

Hi everyone,

Raid Signal v1.4.0 is available. This release brings more of the desktop's live
tactical context into the compact native overlay and adds real candidate spawn
locations for find-item quest objectives.

What is new:

- live squad positions can appear on the compact overlay without opening a
  second relay connection;
- active quest objectives can appear in the overlay, with hollow markers for
  candidate locations;
- find-item objectives can show every known candidate spawn in the refreshed
  Regular, PvE, and Seasonal PvP data;
- maps without a separate packaged floor layer now keep their base artwork
  visible; and
- the last recognized extract panel is retained when a later screenshot
  contains unrelated text, then cleared when the raid ends.

A big thank-you to
[@Reiss-Cashmore](https://github.com/Reiss-Cashmore), whose five-PR contribution
series drove these improvements:

- candidate quest locations: [#25](https://github.com/QTtrash/tarkov-map/pull/25)
- quest markers in the compact overlay: [#26](https://github.com/QTtrash/tarkov-map/pull/26)
- squad positions in the compact overlay: [#27](https://github.com/QTtrash/tarkov-map/pull/27)
- base-layer visibility fix: [#28](https://github.com/QTtrash/tarkov-map/pull/28)
- extract persistence fix: [#29](https://github.com/QTtrash/tarkov-map/pull/29)

Privacy and safety boundaries remain the same. Invitation keys stay in URL
fragments, the Internet relay only forwards ciphertext, and it stores no
position history. The overlay receives bounded, validated snapshots inside the
desktop process; decrypted squad positions are not moved to a second service.

Raid Signal does not read game memory, inject input, automate play, modify game
files, or claim BSG/BattlEye approval or an anti-cheat guarantee. It is an
independent project and is not endorsed by Battlestate Games.

Quest-log import is still experimental because current Tarkov builds may not
retain a safely attributable supported event format. Manual quest selection is
the reliable fallback. Please never publish raw Tarkov logs: they may contain
account details, profile identifiers, tokens, IP addresses, Windows paths, or
chat.

Download v1.4.0:
https://github.com/QTtrash/tarkov-map/releases/tag/v1.4.0

Website:
https://signal.mouchsiadis-solutions.com/

Source:
https://github.com/QTtrash/tarkov-map

Discord:
https://discord.gg/pz4QHAu9WN

The Windows installer is currently unsigned, so Windows may show an
unknown-publisher warning. The release includes a SHA-256 checksum, release
manifest, SPDX SBOM, Microsoft Defender and ClamAV scan gates, and GitHub build
provenance. These are verification materials, not a third-party security audit.

AI-assisted development disclosure: AI tools were used during implementation,
testing, maintainer review, investigation, and drafting this post. Contributor
code was reviewed and adjusted by the maintainer; the code, tests, CI results,
review history, and release evidence are public.
