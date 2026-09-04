// convert-all-planets.js — konwersja all-planets-matrixify-controls.csv → JSON manifest
// (format identyczny z mars-manifest.json — worker czyta bez zmian)
// Uruchom: node convert-all-planets.js
import fs from "fs";

const csv = fs.readFileSync(
  "/opt/data/preview-backup-20260812/generator/all-planets-matrixify-controls.csv",
  "utf8"
);

// Prosty parser CSV (obsługa cudzysłowów i przecinków w polach)
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i+1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ""; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i+1] === '\n') i++;
        row.push(field); field = "";
        if (row.some(f => f.trim() !== "")) rows.push(row);
        row = [];
      } else field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCSV(csv);
const header = rows[0].map(h => h.replace(/^\uFEFF/, "").trim());
const data = rows.slice(1);

// Klasy → parametry (wg mars-manifest)
const CLASS_INFO = {
  S:  { area_ha: 0.5,  cosmo: 100,  price: 50,  img: "s" },
  M:  { area_ha: 1.5,  cosmo: 300,  price: 129, img: "m" },
  L:  { area_ha: 4.5,  cosmo: 900,  price: 369, img: "l" },
  XL: { area_ha: 12,   cosmo: 2500, price: 999, img: "xl" },
};

// Regiony per planeta (R01..R14E — z all-planets csv)
const REGION_MAP = {}; // wypełnione z CSV (region_id z tytułu/kolumny)

const manifest = data.map((row, idx) => {
  const get = (name) => {
    const i = header.indexOf(name);
    return i >= 0 ? (row[i] || "").trim() : "";
  };

  const title = get("Title").replace(/^"|"$/g, "");
  const handle = get("Handle").replace(/^"|"$/g, "");
  const sku = get("Variant SKU").replace(/^"|"$/g, "");
  const price = get("Variant Price").replace(/[^\d.]/g, "");
  const tags = get("Tags").replace(/^"|"$/g, "");
  const planet = (title.match(/^(\w+) Plot/) || [,"?"])[1].toLowerCase();

  // Region z tytułu (np. "Acidalia")
  const region = (title.match(/,\s*([^–]+)$/) || [,""])[1].trim();
  const cls = (title.match(/Class (\w+)/) || [,""])[1];
  const info = CLASS_INFO[cls] || { area_ha: 0.5, cosmo: 0, price: 50, img: "s" };

  // plot_id = SKU (np. MARS-PLOT-000001)
  const plot_id = sku;
  const plot_number = (sku.match(/(\d+)$/) || [,"000001"])[1];

  return {
    plot_id,
    plot_number,
    handle,
    sku,
    title,
    vendor: "Cosmic Lands",
    product_type: "Land Plot",
    status: "active",
    published: true,
    tags,
    price: parseFloat(price) || info.price,
    inventory_quantity: 1,
    inventory_policy: "deny",
    image_src: `https://cdn.shopify.com/s/files/1/1042/7367/4581/files/${planet}-plot-${info.img}.jpg?v=1778230340`,
    mf_plot_id: plot_id,
    mf_planet: planet,
    mf_region: region,
    mf_region_id: get("Metafield: plot.region_id [single_line_text_field]") || "",
    mf_region_name: region,
    mf_class: cls,
    mf_area_ha: info.area_ha,
    mf_price_eur: parseFloat(price) || info.price,
    mf_coordinates_lat: parseFloat(get("Metafield: plot.coordinates_lat [number_decimal]")) || 0,
    mf_coordinates_lon: parseFloat(get("Metafield: plot.coordinates_lon [number_decimal]")) || 0,
    mf_cosmo_tokens: info.cosmo,
    mf_status: "available",
    mf_sale_status: "available",
    mf_product_status: "active",
    mf_unlock_year: null,
    planet,
    region,
    region_code: get("Metafield: plot.region_id [single_line_text_field]") || "",
    class: cls,
    lat: parseFloat(get("Metafield: plot.coordinates_lat [number_decimal]")) || 0,
    lon: parseFloat(get("Metafield: plot.coordinates_lon [number_decimal]")) || 0,
    unlock_year: null,
    variant_id: null,
  };
});

fs.writeFileSync(
  "/opt/data/workspace/cosmiclands-nft/all-planets-manifest.json",
  JSON.stringify(manifest, null, 2)
);
console.log(`Converted ${manifest.length} plots (${new Set(manifest.map(p => p.planet)).size} planets)`);

// Podsumowanie
const byPlanet = {};
manifest.forEach(p => { byPlanet[p.planet] = (byPlanet[p.planet]||0)+1; });
console.log("Per planeta:", JSON.stringify(byPlanet));
