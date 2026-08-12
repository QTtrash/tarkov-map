import type { MapPoi, OcrTextCapture, RaidExtractState } from "./types";

export function normalizeOcr(value: string) {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/\b0(?=[a-z])/g, "o")
    .replace(/\b1(?=[a-z])/g, "l")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(first: string, second: string) {
  if (first === second) return 1;
  if (!first.length || !second.length) return 0;
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let i = 1; i <= first.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= second.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (first[i - 1] === second[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return 1 - previous[second.length] / Math.max(first.length, second.length);
}

function lineScore(line: string, alias: string) {
  if (line === alias || (alias.length >= 4 && line.includes(alias))) return 1;
  const lineTokens = line.split(" ");
  const aliasTokens = alias.split(" ");
  let score = similarity(line, alias);
  for (let index = 0; index <= lineTokens.length - aliasTokens.length; index += 1) {
    score = Math.max(score, similarity(lineTokens.slice(index, index + aliasTokens.length).join(" "), alias));
  }
  return score;
}

export function recognizeRaidExtracts(capture: OcrTextCapture, mapId: string, pois: MapPoi[]): RaidExtractState {
  const extractPois = pois.filter((poi) => poi.kind === "extract" || poi.kind === "transit");
  const lines = capture.rawText.split(/\r?\n/).map(normalizeOcr).filter((line) => line.length >= 3);
  const matches = new Map<string, { name: string; score: number }>();
  for (const line of lines) {
    const ranked = extractPois.map((poi) => ({
      poi,
      score: Math.max(...[poi.name, ...(poi.aliases ?? [])].map(normalizeOcr).filter(Boolean).map((alias) => lineScore(line, alias))),
    })).sort((left, right) => right.score - left.score);
    const winner = ranked[0];
    const runnerUp = ranked[1];
    if (winner && winner.score >= 0.84 && (winner.score === 1 || !runnerUp || winner.score - runnerUp.score >= 0.08)) {
      const existing = matches.get(winner.poi.id);
      if (!existing || existing.score < winner.score) matches.set(winner.poi.id, { name: winner.poi.name, score: winner.score });
    }
  }
  const values = [...matches.values()];
  return {
    mapId,
    status: values.length ? "recognized" : "unknown",
    activeExtractIds: [...matches.keys()],
    recognizedNames: values.map((value) => value.name),
    rawText: capture.rawText,
    observedAt: capture.observedAt,
    confidence: values.length ? Math.min(...values.map((value) => value.score)) : 0,
    message: values.length ? `${values.length} active raid option${values.length === 1 ? "" : "s"} recognized` : capture.message || "Active extracts unknown",
  };
}
