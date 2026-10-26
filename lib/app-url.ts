/**
 * Public origin for links the app hands out (invitations). Prefer the
 * configured APP_URL: the request's own origin comes from the Host header,
 * which a client or misconfigured proxy can spoof. Falls back to the request
 * origin for local development.
 */
export function getAppOrigin(request: Request): string {
  const configured = process.env.APP_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      console.warn("[app-url] APP_URL is not a valid URL; using request origin");
    }
  }
  return new URL(request.url).origin;
}
