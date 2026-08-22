import { describe, expect, it } from "vitest";
import { questDiagnosticSummary } from "./quest-diagnostics";
import type { QuestSyncPreview } from "./types";

const preview: QuestSyncPreview = {
  available: false,
  enabled: false,
  shouldReview: false,
  logsRoot: "C:\\Users\\private-name\\Escape from Tarkov\\Logs",
  profiles: [],
  eventCount: 0,
  sessionsScanned: 4,
  filesScanned: 8,
  notificationFilesScanned: 4,
  outputFilesScanned: 4,
  chatMessageMarkers: 0,
  lifecycleHints: 6,
  formatStatus: "no-recognized-events",
  malformedRecords: 0,
  unattributedRecords: 0,
  suspiciousSessions: 0,
  fingerprint: "a".repeat(64),
  message: "No recognized records",
};

describe("questDiagnosticSummary", () => {
  it("reports compatibility counters without copying sensitive paths or payloads", () => {
    const summary = questDiagnosticSummary(preview);
    expect(summary).toContain("configured-root: parent-root");
    expect(summary).toContain("notification-files: 4");
    expect(summary).toContain("output-files: 4");
    expect(summary).not.toContain("private-name");
    expect(summary).not.toContain(preview.logsRoot);
    expect(summary).not.toContain(preview.fingerprint);
  });

  it("distinguishes an individual session without exposing its name", () => {
    const summary = questDiagnosticSummary({ ...preview, logsRoot: "D:\\EFT\\Logs\\log_2026.08.22_private" });
    expect(summary).toContain("configured-root: individual-session");
    expect(summary).not.toContain("log_2026");
  });
});
