// Builds the static shop into docs/ (served by GitHub Pages) from shop.json and photos/.
// No server or database: product data is embedded in the page, the quote list lives in localStorage
// and orders are sent as a pre-filled WhatsApp message.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs");
const shop = JSON.parse(fs.readFileSync(path.join(ROOT, "shop.json"), "utf8"));

fs.rmSync(OUT, { recursive: true, force: true });
for (const d of ["img/g", "img/f", "fonts"]) fs.mkdirSync(path.join(OUT, d), { recursive: true });

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const known = new Set(shop.collections.map(c => c.id));
const products = [];
for (const p of shop.products) {
  if (!known.has(p.collection)) throw new Error(`${p.id}: unknown collection "${p.collection}"`);
  const photos = [];
  for (let k = 1; k <= p.photos; k++) {
    const src = path.join(ROOT, "photos", `${p.id}-${k}.jpg`), name = `${p.id}-${k}.jpg`;
    if (!fs.existsSync(src)) throw new Error(`${p.id}: missing photo ${src}`);
    // Grid thumbnail: square, whole product visible on a light background (no cropping)
    await sharp(src).rotate().resize(640, 640, { fit: "contain", background: "#efeeec" }).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(OUT, "img/g", name));
    await sharp(src).rotate().resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(OUT, "img/f", name));
    photos.push(name);
  }
  const col = shop.collections.find(c => c.id === p.collection);
  const text = `${p.name} ${p.description}`;
  products.push({
    id: p.id, nombre: p.name, col: p.collection, fotos: photos, desc: p.description, armado: false,
    badge: p.badge || null,
    tags: col.chips.filter(([, re]) => new RegExp(re, "i").test(text)).map(([label]) => label),
    precio: shop.prices[p.id] || null,
  });
}
await sharp(path.join(ROOT, "photos", `${shop.hero}.jpg`)).resize({ width: 1600, withoutEnlargement: true })
  .jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(OUT, "img/f", "hero.jpg"));

const FONTS = ["montserrat-latin-400-normal", "montserrat-latin-500-normal", "montserrat-latin-600-normal", "montserrat-latin-700-normal", "cormorant-garamond-latin-600-normal"];
const fontFace = FONTS.map(f => {
  const pkg = f.startsWith("montserrat") ? "montserrat" : "cormorant-garamond";
  fs.copyFileSync(path.join(ROOT, `node_modules/@fontsource/${pkg}/files/${f}.woff2`), path.join(OUT, "fonts", `${f}.woff2`));
  const family = pkg === "montserrat" ? "Montserrat" : "Cormorant Garamond";
  return `@font-face{font-family:"${family}";font-weight:${f.match(/-(\d{3})-/)[1]};font-style:normal;font-display:swap;src:url(fonts/${f}.woff2) format("woff2")}`;
}).join("\n");

const cols = shop.collections.map(c => ({
  id: c.id, nombre: c.name,
  img: products.find(p => p.col === c.id).fotos[0],
  chips: c.chips.map(([label]) => label).filter(label => products.some(p => p.col === c.id && p.tags.includes(label))),
}));
const DATA = {
  marca: shop.brand, wa: shop.whatsapp, waVisible: shop.whatsappDisplay, storeKey: shop.storeKey, cols, productos: products,
  redes: Object.fromEntries(Object.entries(shop.socials).map(([k, v]) => [k, { texto: v.text, url: v.url }])),
};

const html = fs.readFileSync(path.join(ROOT, "src/template.html"), "utf8")
  .replace("/*FONTS*/", () => fontFace)
  .replace("__PORTADA__", "hero.jpg")
  .replaceAll("__BRAND__", esc(shop.brand))
  .replace("__INITIAL__", esc(shop.initial))
  .replace("__SHORT__", esc(shop.short))
  .replace("__ABOUT__", esc(shop.about))
  .replaceAll("__TAGLINE__", esc(shop.tagline))
  // "<" is escaped so product text can never close the <script> tag
  .replace("/*DATA*/", () => `const DATA=${JSON.stringify(DATA).replace(/</g, "\\u003c")};`);
const leftover = html.match(/__[A-Z]+__/);
if (leftover) throw new Error(`Unreplaced placeholder ${leftover[0]}`);
fs.writeFileSync(path.join(OUT, "index.html"), html);
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");
console.log(`Shop built in docs/: ${products.length} products, ${cols.length} collections`);
for (const c of cols) console.log(`  ${c.nombre}: ${products.filter(p => p.col === c.id).length} products · chips: ${c.chips.join(", ")}`);
