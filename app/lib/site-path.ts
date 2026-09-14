const GITHUB_PAGES_PREFIX = "/jikeoro-web-proto";

export function sitePath(path: string) {
  if (
    typeof window !== "undefined" &&
    (window.location.hostname.toLowerCase().endsWith("github.io") ||
      window.location.pathname.startsWith(GITHUB_PAGES_PREFIX))
  ) {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return `${GITHUB_PAGES_PREFIX}${normalized}`;
  }

  return path;
}
