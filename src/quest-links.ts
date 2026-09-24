/** Only direct article links; never embeds, arbitrary URLs, or URLs containing credentials. */
export function validatedWikiUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "escapefromtarkov.fandom.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    if (!/^\/wiki\/[^/]+$/.test(url.pathname)) return null;
    const title = decodeURIComponent(url.pathname.slice(6));
    if (!title || /[:/\\\p{Cc}]/u.test(title)) return null;
    return url.href;
  } catch {
    return null;
  }
}
