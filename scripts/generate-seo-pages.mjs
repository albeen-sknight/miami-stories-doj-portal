import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const routesPath = resolve(rootDir, "apps/web/src/seoRoutes.json");
const distDir = resolve(rootDir, "apps/web/dist");
const indexPath = resolve(distDir, "index.html");
const siteUrl = "https://miami-stories-doj.pages.dev";

const routes = JSON.parse(await readFile(routesPath, "utf8"));
const baseHtml = await readFile(indexPath, "utf8");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceMeta(html, attribute, key, content) {
  const escapedContent = escapeHtml(content);
  const pattern = new RegExp(`<meta\\s+${attribute}=["']${key}["'][^>]*>`, "i");
  const replacement = `<meta ${attribute}="${key}" content="${escapedContent}" />`;
  if (!pattern.test(html)) throw new Error(`Missing ${attribute} metadata: ${key}`);
  return html.replace(pattern, replacement);
}

function replaceCanonical(html, href) {
  const pattern = /<link\s+rel=["']canonical["'][^>]*>/i;
  if (!pattern.test(html)) throw new Error("Missing canonical link in built index.html");
  return html.replace(pattern, `<link rel="canonical" href="${escapeHtml(href)}" />`);
}

function renderRouteHtml(route) {
  const canonicalUrl = `${siteUrl}${route.path === "/" ? "/" : route.path}`;
  let html = baseHtml.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(route.title)}</title>`);
  html = replaceMeta(html, "name", "description", route.description);
  html = replaceMeta(html, "name", "robots", "index,follow");
  html = replaceMeta(html, "property", "og:title", route.title);
  html = replaceMeta(html, "property", "og:description", route.description);
  html = replaceMeta(html, "property", "og:url", canonicalUrl);
  html = replaceMeta(html, "name", "twitter:title", route.title);
  html = replaceMeta(html, "name", "twitter:description", route.description);
  return replaceCanonical(html, canonicalUrl);
}

let generatedCount = 0;
for (const route of routes) {
  if (route.path === "/") continue;
  const outputPath = resolve(distDir, `${route.path.replace(/^\//, "")}.html`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderRouteHtml(route), "utf8");
  generatedCount += 1;
}

console.log(`Generated ${generatedCount} route-specific SEO entry pages in ${distDir}`);
