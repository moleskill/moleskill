/** The public address of the site, used in links that leave the app (invitation emails). */
export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://moleskill.com";
  const absolute = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
  return absolute.replace(/\/+$/, "");
}
