export interface SignalRelease {
  filename: string;
  sha256: string;
  version: string;
}

export function signalRelease(value: unknown): SignalRelease | null {
  if (!value || typeof value !== "object") return null;
  const release = value as Record<string, unknown>;
  if (typeof release.filename !== "string" || !/^[A-Za-z0-9._-]+\.exe$/.test(release.filename)) return null;
  if (typeof release.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(release.sha256)) return null;
  if (typeof release.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(release.version)) return null;
  return { filename: release.filename, sha256: release.sha256, version: release.version };
}
