export interface SignalRelease {
  filename: string;
  sha256: string;
  version: string;
  downloadUrl: string;
}

export function signalRelease(value: unknown): SignalRelease | null {
  if (!value || typeof value !== "object") return null;
  const release = value as Record<string, unknown>;
  if (typeof release.filename !== "string" || !/^[A-Za-z0-9._-]+\.exe$/.test(release.filename)) return null;
  if (typeof release.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(release.sha256)) return null;
  if (typeof release.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(release.version))
    return null;
  if (typeof release.downloadUrl !== "string") return null;
  let downloadUrl: URL;
  try {
    downloadUrl = new URL(release.downloadUrl);
  } catch {
    return null;
  }
  const expectedPath = `/QTtrash/tarkov-map/releases/download/v${release.version}/${release.filename}`;
  if (
    downloadUrl.protocol !== "https:" ||
    downloadUrl.hostname !== "github.com" ||
    downloadUrl.pathname !== expectedPath
  )
    return null;
  return {
    filename: release.filename,
    sha256: release.sha256,
    version: release.version,
    downloadUrl: downloadUrl.toString(),
  };
}
