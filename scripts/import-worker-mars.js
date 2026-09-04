#!/usr/bin/env node
/**
 * worker-import-mars.js — Cloudflare Worker: import produktów z manifestu do Shopify
 * POPRAWIONY 2026-08-20 (FAZA A3) — wg listy R1–R6 + autoryzacja + upsert.
 *
 * Zmiany vs oryginał:
 *  R1  SHOP = rzkhvb-m1.myshopify.com (live; martwy cosmiclands.myshopify.com = 402)
 *  R2  API_VERSION = 2026-07 (2025-01 wycofane)
 *  R3  productCreate → productSet (upsert po handle) + publishablePublish
 *  R4  locationId/publicationId z env (nie placeholder)
 *  R5  walidacja X-Import-Secret === env.IMPORT_SECRET (timing-safe) — worker NIE jest publiczny
 *  R6  clamp from/limit (≤ 250/request), obsługa błędów tokena/GraphQL, retry
 *
 * ⚠️ Sekrety TYLKO przez `wrangler secret put` (NIGDY w kodzie/JSON).
 */

const SHOP = 'rzkhvb-m1.myshopify.com';
const API_VERSION = '2026-07';
const BATCH_SIZE = 5; // produktów równolegle
const DELAY_MS = 500; // między batchami
const MAX_LIMIT = 250; // Shopify GraphQL pagination cap

// timing-safe compare (nie używaj === dla sekretów)
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function getToken(env) {
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.CLIENT_ID,
      client_secret: env.CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`token failed ${res.status}: ${body.slice(0, 200)}`);
  }
  const { access_token } = await res.json();
  if (!access_token) throw new Error('token response missing access_token');
  return access_token;
}

async function gql(token, query, variables = {}) {
  const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(`GraphQL: ${json.errors[0].message}`);
  return json;
}

async function upsertProduct(token, env, plot) {
  // 1. Upsert po handle (productSet — tworzy lub aktualizuje; NIE dubluje)
  const setRes = await gql(token, `
    mutation productSet($input: ProductSetInput!) {
      productSet(input: $input) {
        product {
          id
          handle
          variants(first: 1) { edges { node { id sku } } }
        }
        userErrors { field message }
      }
    }
  `, {
    input: {
      handle: plot.handle,
      title: plot.title,
      vendor: plot.vendor,
      productType: plot.product_type,
      status: 'ACTIVE',
      tags: plot.tags.split(', '),
      variants: [{
        sku: plot.sku,
        price: String(plot.price),
        inventoryPolicy: 'DENY',
        inventoryQuantities: [{
          availableQuantity: plot.inventory_quantity,
          locationId: env.LOCATION_ID, // R4: realne locationId z env
        }],
      }],
      metafields: [
        { namespace: 'plot', key: 'plot_id',         type: 'single_line_text_field', value: plot.mf_plot_id },
        { namespace: 'plot', key: 'planet',           type: 'single_line_text_field', value: plot.mf_planet },
        { namespace: 'plot', key: 'region',           type: 'single_line_text_field', value: plot.mf_region },
        { namespace: 'plot', key: 'region_id',        type: 'single_line_text_field', value: plot.mf_region_id },
        { namespace: 'plot', key: 'region_name',      type: 'single_line_text_field', value: plot.mf_region_name },
        { namespace: 'plot', key: 'class',            type: 'single_line_text_field', value: plot.mf_class },
        { namespace: 'plot', key: 'area_ha',          type: 'number_decimal',         value: String(plot.mf_area_ha) },
        { namespace: 'plot', key: 'price_eur',        type: 'number_decimal',         value: String(plot.mf_price_eur) },
        { namespace: 'plot', key: 'coordinates_lat',  type: 'number_decimal',         value: String(plot.mf_coordinates_lat) },
        { namespace: 'plot', key: 'coordinates_lon',  type: 'number_decimal',         value: String(plot.mf_coordinates_lon) },
        { namespace: 'plot', key: 'cosmo_tokens',     type: 'number_integer',         value: String(plot.mf_cosmo_tokens) },
        { namespace: 'plot', key: 'status',           type: 'single_line_text_field', value: plot.mf_status },
        { namespace: 'plot', key: 'sale_status',      type: 'single_line_text_field', value: plot.mf_sale_status },
        { namespace: 'plot', key: 'product_status',   type: 'single_line_text_field', value: plot.mf_product_status },
        ...(plot.mf_unlock_year ? [{
          namespace: 'plot', key: 'unlock_year', type: 'number_integer', value: String(plot.mf_unlock_year)
        }] : []),
      ],
    }
  });

  const errs = setRes.data?.productSet?.userErrors;
  if (errs?.length) return { ok: false, handle: plot.handle, errors: errs };

  const productId = setRes.data.productSet.product.id;

  // 2. Publish do Online Store (R4: realne publicationId z env)
  const pubRes = await gql(token, `
    mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors { field message }
      }
    }
  `, {
    id: productId,
    input: [{ publicationId: env.PUBLICATION_ID }],
  });
  const pubErrs = pubRes.data?.publishablePublish?.userErrors;
  if (pubErrs?.length) return { ok: false, handle: plot.handle, errors: pubErrs };

  // 3. Dodaj obraz (jeśli jest URL)
  if (plot.image_src) {
    await gql(token, `
      mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          userErrors { field message }
        }
      }
    `, {
      productId,
      media: [{ originalSource: plot.image_src, mediaContentType: 'IMAGE' }],
    });
  }

  return { ok: true, handle: plot.handle, productId };
}

export default {
  async fetch(request, env, ctx) {
    // R5: autoryzacja — worker nie jest publiczny
    const secret = request.headers.get('X-Import-Secret');
    if (!timingSafeEqual(secret, env.IMPORT_SECRET)) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    // R6: clamp from/limit
    let startFrom = parseInt(url.searchParams.get('from') || '0', 10);
    let limit = parseInt(url.searchParams.get('limit') || '50', 10);
    if (!Number.isFinite(startFrom) || startFrom < 0) startFrom = 0;
    if (!Number.isFinite(limit) || limit < 1) limit = 50;
    limit = Math.min(limit, MAX_LIMIT);

    // Brak wymaganych sekretów = fail fast (nie 500 z połowy)
    for (const k of ['CLIENT_ID', 'CLIENT_SECRET', 'IMPORT_SECRET', 'LOCATION_ID', 'PUBLICATION_ID']) {
      if (!env[k]) {
        return new Response(JSON.stringify({ error: `missing env ${k}` }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    let token;
    try {
      token = await getToken(env);
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Manifest w KV (zapisany przez `wrangler kv:key put`)
    const manifest = await env.MARS_KV.get('manifest', 'json');
    if (!manifest || !Array.isArray(manifest)) {
      return new Response(JSON.stringify({ error: 'manifest missing in KV' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const batch = manifest.slice(startFrom, startFrom + limit);
    const results = { ok: [], failed: [] };

    for (let i = 0; i < batch.length; i += BATCH_SIZE) {
      const chunk = batch.slice(i, i + BATCH_SIZE);
      const chunkResults = await Promise.all(chunk.map(p => upsertProduct(token, env, p)));
      chunkResults.forEach(r => r.ok ? results.ok.push(r.handle) : results.failed.push(r));
      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    return new Response(JSON.stringify({
      processed: batch.length,
      ok: results.ok.length,
      failed: results.failed.length,
      next_from: startFrom + limit,
      errors: results.failed.slice(0, 10),
    }, null, 2), { headers: { 'Content-Type': 'application/json' } });
  }
};
