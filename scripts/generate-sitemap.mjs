import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const routesPath = resolve(rootDir, "apps/web/src/seoRoutes.json");
const sitemapPath = resolve(rootDir, "apps/web/public/sitemap.xml");
const siteUrl = "https://miami-stories-doj.pages.dev";
const generatedAt = new Date().toISOString().slice(0, 10);

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeRoutePath(path) {
  if (!path || typeof path !== "string") throw new Error("SEO route path must be a string.");
  return path === "/" ? "/" : `/${path.replace(/^\/+|\/+$/g, "")}`;
}

const routes = JSON.parse(await readFile(routesPath, "utf8"));
const seen = new Set();
const urls = routes.map((route) => {
  const path = normalizeRoutePath(route.path);
  if (seen.has(path)) throw new Error(`Duplicate sitemap route: ${path}`);
  seen.add(path);
  return {
    loc: `${siteUrl}${path === "/" ? "/" : path}`,
    lastmod: route.lastmod ?? generatedAt,
    changefreq: route.changefreq ?? "monthly",
    priority: Number(route.priority ?? 0.5).toFixed(2)
  };
});

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls
    .map(
      (url) =>
        `  <url>\n` +
        `    <loc>${escapeXml(url.loc)}</loc>\n` +
        `    <lastmod>${escapeXml(url.lastmod)}</lastmod>\n` +
        `    <changefreq>${escapeXml(url.changefreq)}</changefreq>\n` +
        `    <priority>${escapeXml(url.priority)}</priority>\n` +
        `  </url>`
    )
    .join("\n") +
  `\n</urlset>\n`;

await mkdir(dirname(sitemapPath), { recursive: true });
await writeFile(sitemapPath, xml, "utf8");

console.log(`Generated ${urls.length} sitemap URLs at ${sitemapPath}`);
