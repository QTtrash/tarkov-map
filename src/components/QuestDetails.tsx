import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { loadQuestCatalog, loadQuestLinks, resolveQuestObjective } from "../quest-catalog";
import { validatedWikiUrl } from "../quest-links";
import { isTauriRuntime } from "../locator";
import type { QuestGameMode, QuestObjectivePoi } from "../types";
import { Dialog } from "./Dialog";
import { QuestImage } from "./QuestImage";
import { QuestLocationPreview } from "./QuestLocationPreview";

export function QuestDetails({
  poi,
  mode,
  onClose,
}: {
  poi: QuestObjectivePoi;
  mode: QuestGameMode;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<ReturnType<typeof resolveQuestObjective>>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [wikiUrl, setWikiUrl] = useState<string | null>(null);
  const [linkError, setLinkError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false;
    setDetails(null);
    setWikiUrl(null);
    setLinkError(false);
    setState("loading");
    void loadQuestCatalog(mode)
      .then((bundle) => {
        if (disposed) return;
        const next = resolveQuestObjective(bundle, poi);
        setDetails(next);
        setState(next ? "ready" : "error");
      })
      .catch(() => {
        if (!disposed) setState("error");
      });
    void loadQuestLinks()
      .then((metadata) => {
        if (!disposed)
          setWikiUrl(
            validatedWikiUrl(
              metadata.links.find((link) => link.taskId === poi.taskId && link.gameMode === mode)?.wikiUrl,
            ),
          );
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [mode, poi, retry]);

  return (
    <Dialog className="quest-marker-dialog" titleId="quest-marker-title" onClose={onClose}>
      <header>
        <div>
          <span className="kicker">QUEST OBJECTIVE{details ? ` · ${details.quest.traderName}` : ""}</span>
          <h2 id="quest-marker-title">{details?.quest.name ?? poi.name}</h2>
        </div>
        <button className="quest-details-close" aria-label="Close quest details" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="quest-marker-body">
        {state === "loading" && <p role="status">Loading bundled quest information…</p>}
        {state === "error" && (
          <p role="status">
            Additional quest information is unavailable. The marker description remains below.{" "}
            <button onClick={() => setRetry((value) => value + 1)}>Retry details</button>
          </p>
        )}
        {details && <p className="quest-marker-summary">{details.quest.summary}</p>}
        <section aria-label="Selected objective">
          <h3>{details?.objective.optional ? "Optional objective" : "Objective"}</h3>
          <p>{details?.objective.description ?? poi.description}</p>
          {details && details.objective.details.length > 0 && (
            <ul>
              {details.objective.details.map((detail, index) => (
                <li key={index}>{detail}</li>
              ))}
            </ul>
          )}
        </section>
        {poi.kind === "quest-possible-location" && (
          <p className="quest-location-caution">
            Possible location {(poi.locationIndex ?? 0) + 1}
            {poi.locationCount ? ` of ${poi.locationCount}` : ""}. A spawn here is not guaranteed; check the other
            possible locations.
          </p>
        )}
        <div className="quest-marker-images">
          <QuestLocationPreview poi={poi} />
          <QuestImage
            key={`${mode}:${poi.taskId}`}
            taskId={poi.taskId}
            mode={mode}
            name={details?.quest.name ?? poi.name}
          />
        </div>
        {wikiUrl ? (
          <a
            href={wikiUrl}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            className="quest-wiki-link"
            onClick={(event) => {
              if (!isTauriRuntime()) return;
              event.preventDefault();
              const safeUrl = validatedWikiUrl(wikiUrl);
              if (safeUrl) void openUrl(safeUrl).catch(() => setLinkError(true));
            }}
          >
            Open Tarkov Wiki ↗
          </a>
        ) : (
          <p className="quest-wiki-unavailable">No verified Wiki link available.</p>
        )}
        {linkError && (
          <p role="status">
            Could not open the Wiki.{" "}
            <button
              onClick={() => {
                if (wikiUrl) void navigator.clipboard.writeText(wikiUrl).catch(() => undefined);
              }}
            >
              Copy Wiki link
            </button>
          </p>
        )}
      </div>
    </Dialog>
  );
}
