#!/usr/bin/env node
/**
 * generate-nft-metadata.mjs — metadata NFT deed z mars-manifest.json (captain.js).
 * Wejście: mars-manifest.json (plik z captain.js). Wyjście: ./nft-meta/{plot_id}.json
 * Każdy plik: { name, description, external_url, attributes:[...] } zgodny z ERC-721 metadata.
 *
 * Użycie: node scripts/generate-nft-metadata.mjs [--manifest ../mars-manifest.json] [--limit 3]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

const manifestPath = getArg('--manifest', path.resolve(__dirname, '..', '..', 'scripts', 'mars-manifest.json'));
const limit = parseInt(getArg('--limit', '0'), 10);
const outDir = getArg('--out', path.resolve(__dirname, '..', 'nft-metadata'));

if (!fs.existsSync(manifestPath)) {
  console.error(`Brak manifestu: ${manifestPath}\nNajpierw: node generate-mars-manifest-captain.js (bez --dry-run) w /opt/data/scripts`);
  process.exit(1);
}
const plots = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const slice = limit > 0 ? plots.slice(0, limit) : plots;

fs.mkdirSync(outDir, { recursive: true });
let n = 0;
for (const p of slice) {
  const area = p.mf_area_ha ?? p.area_ha;
  const cosmo = p.mf_cosmo_tokens ?? p.cosmo_tokens;
  const meta = {
    name: `Mars Plot #${p.plot_number ?? p.plot_id}`,
    description: `Certified planetary land deed for ${p.mf_region ?? p.region} (${p.mf_class ?? p.class}, ${area} ha) — Cosmic Lands. Not real estate: artistic collectible.`,
    image: p.image_src,
    attributes: [
      { trait_type: 'Planet', value: 'Mars' },
      { trait_type: 'Region', value: p.mf_region ?? p.region },
      { trait_type: 'Class', value: p.mf_class ?? p.class },
      { trait_type: 'Plot', value: p.plot_number ?? p.plot_id },
      { trait_type: 'COSMO Bonus', value: String(cosmo ?? 0) },
      { trait_type: 'Owner', value: p.owner_name || 'TBD' },
      { trait_type: 'Certificate Number', value: p.certificate_number || 'TBD' },
      { trait_type: 'Coordinates', value: `${p.mf_coordinates_lat ?? p.lat ?? ''}, ${p.mf_coordinates_lon ?? p.lon ?? ''}` },
      { trait_type: 'Area', value: `${area ?? ''} ha` },
      { trait_type: 'Price EUR', value: String(p.mf_price_eur ?? p.price ?? '') },
    ],
    // cross-reference (v3 testy 27.08): NFT wskazuje certyfikat, certyfikat wskazuje tokenId
    token_id: p.token_id || null,
    owner_name: p.owner_name || null,
    owner_address: p.owner_address || null,
    certificate_number: p.certificate_number || null,
    // dodatkowe (off-chain, dla /verify)
    registry: 'Cosmic Lands Planetary Registry',
    issued_by: 'Rainbow Universe Operating System',
    certificate: `https://cdn.cosmiclands.space/certs/${p.plot_id}.pdf`,
  };
  fs.writeFileSync(path.join(outDir, `${p.plot_id}.json`), JSON.stringify(meta, null, 2));
  n++;
}
console.log(`✅ Metadata: ${n} plików JSON w ${outDir}`);
console.log(`   Przykład: ${path.join(outDir, slice[0].plot_id + '.json')}`);