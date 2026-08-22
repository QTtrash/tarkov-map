import packageMetadata from "../package.json";
import type { QuestSyncPreview } from "./types";

export const questCompatibilityIssueUrl =
  "https://github.com/QTtrash/tarkov-map/issues/new?template=quest_log_compatibility.yml";

function configuredRootRole(logsRoot: string | null) {
  if (!logsRoot) return "unavailable";
  const leaf = logsRoot.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
  return leaf.startsWith("log_") ? "individual-session" : "parent-root";
}

export function questDiagnosticSummary(preview: QuestSyncPreview) {
  return [
    `Raid Signal ${packageMetadata.version} quest-log diagnostics`,
    `configured-root: ${configuredRootRole(preview.logsRoot)}`,
    `format-status: ${preview.formatStatus}`,
    `sessions-scanned: ${preview.sessionsScanned}`,
    `files-scanned: ${preview.filesScanned}`,
    `notification-files: ${preview.notificationFilesScanned}`,
    `output-files: ${preview.outputFilesScanned}`,
    `chat-message-markers: ${preview.chatMessageMarkers}`,
    `lifecycle-hints: ${preview.lifecycleHints}`,
    `recognized-events: ${preview.eventCount}`,
    `anonymized-profiles: ${preview.profiles.length}`,
    `malformed-records: ${preview.malformedRecords}`,
    `unattributed-records: ${preview.unattributedRecords}`,
    `suspicious-sessions: ${preview.suspiciousSessions}`,
    "privacy: no paths, identifiers, timestamps, or log contents included",
  ].join("\n");
}
