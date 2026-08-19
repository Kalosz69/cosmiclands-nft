# RUNBOOK — WDROŻENIE SKLEPU COSMIC LANDS (NFT + COSMO + CERTYFIKATY)

> **TOKENOMIKA COSMO v2 (K 18.08)** — sztywna emisja **58 000 000 COSMO** (zero dodruku), MAX_SUPPLY kontraktu = 58M,
> pakiety do działek **S=80 / M=240 / L=720 / XL=2160** (zmniejszone o 20%). Pełny podział: `12-KTO-USTALA-CENE-2026-08-18.md`.
> Wszystkie stare wyliczenia (100M cap, 100/300/900/2700) w tym dokumencie poniżej są **nieaktualne** — patrz linie FAZA 5 / T6.

> **Wersja:** 1.0 · **Data:** 2026-08-16 · **Sieć:** Base L2 (8453 mainnet / 84532 sepolia)
> **Cel:** uruchomienie pełnego sklepu zgodnie z `cosmic-lands-architecture.html` BEZ Supabase, z testami akceptacyjnymi T1–T8.
> **Status:** gotowe do rozpoczęcia po dostarczeniu kluczy + decyzji dostępowych.

---

## 0. PODSUMOWANIE WYKONAWCZE

Wszystkie artefakty są przygotowane i **przetestowane lokalnie** (`tests/` — PASS):
1. Kontrakty Solidity (ERC-721 deed + ERC-20 COSMO) — skompilowane (solc 0.8.24, OZ 5.2)
2. Skrypty deploy (Base Sepolia → mainnet)
3. Worker Cloudflare: webhook HMAC → ID-cache → mint → PDF → email → COSMO
4. Generator PDF certyfikatu (pdf-lib, działa lokalnie — test 2KB PDF)
5. Generator metadata NFT (IPFS-ready JSON)
6. Testy symulacyjne (HMAC 3/3, worker-lokalny 5/5, PDF PASS, kompilacja PASS)

**Koszt jednorazowy:** ~10–30 USD gaz (Base), reszta free.

```
/opt/data/workspace/cosmiclands-nft/
├── package.json
├── contracts/
│   ├── CosmicLandsDeed.sol   ← ERC-721 deed (mint/burn/setBaseURI/exists)
│   └── CosmoToken.sol        ← ERC-20 (mint, cap 58M sztywna emisja)
├── scripts/
│   ├── compile.mjs           ← solc-js: kontrakty → build/*.json
│   ├── deploy-nft.mjs        ← deploy deed na Base (RPC env)
│   ├── deploy-cosmo.mjs      ← deploy COSMO
│   ├── mint-test.mjs         ← mint 1 deed w teście
│   ├── generate-certificate.mjs ← PDF A4 (pdf-lib)
│   ├── generate-nft-metadata.mjs ← JSON metadata z mars-manifest.json
│   ├── send-email.mjs        ← Resend (demo bez klucza)
│   └── worker-sync.mjs       ← CF Worker: webhook → pipeline
├── tests/
│   ├── run-tests.mjs         ← całość lokalna (HMAC/PDF/artefakty)
│   ├── test-webhook-hmac.mjs ← 3 testy HMAC
│   └── test-worker-locally.mjs ← 5 testów worker-logiki (bez sieci)
└── build/                     ← ABI+bytecode (skompilowane 16.08)
```

**Testowany stan (16.08):**
```
✅ compile: CosmicLandsDeed.json (ABI 44, bytecode 7.4KB) + CosmoToken.json (ABI 28, bytecode 3.6KB)
✅ Webhook HMAC: 3/3 PASS (poprawny→OK, zmiana body→reject, zły //secret→reject)
✅ Worker local: 5/5 PASS (HMAC, skip non-paid, dedup KV, order→pipeline, health)
✅ PDF cert: MARS-PLOT-000042.pdf (2091 B, A4)
✅ Metadata: 2–3 JSON valid (MARS-PLOT-000001, ...)
✅ run-tests: Wszystkie testy lokalne PASS
```

---

## 1. ARCHITEKTURA DOCELOWA (BEZ SUPABASE)

```
Kupujący (map.cosmiclands.space) → Shopify storefront (koszyk/checkout)
        │ order paid (webhook orders/paid, HMAC-SHA256)
        ▼
Cloudflare Worker (cosmic-lands-sync)  ← wdrażamy teraz
   • weryfikacja HMAC (SHOPIFY_WEBHOOK_SECRET)
   • dedupe (cache: order_id → orderland)
   • odczyt order / line item (plot_id)
   ├─ 1. Generate certificate PDF (in-worker, pdf-lib)
   ├─ 2. Zapis PDF do CF R2/KV (cdn.cosmiclands.space/certs/{plot}.pdf)
   ├─ 3. Mint NFT (CosmicLandsDeed.mintDeed(buyer,…)) — Base mainnet (RPC)
   ├─ 4. Metadata → IPFS (Pinata) → tokenURI (ipfs://)
   ├─ 5. COSMO: CosmoToken.mint(customer, bonus) (80/240/720/2160 — tokenomika v2, K 18.08)
   ├─ 6. Email Resend: {ordre-confirmation + PDF attachment, nft-confirmation, cert-shipped}
   └─ 7. Shopify metafield plot.status=sold (GraphQL Admin API)
```

**Reguły zapewnienia:** idempotencja (dedup po order_id), obsługa błędów (try/catch per krok, log i kontynuacja, ręczna retry), retry webhooków Shopify (Shopify retries 19×/48h), żadna centralna baza — stan w Shopify/Cf2/KV + on-chain.

---

## 2. FAZY WDROŻENIA KROK PO KROKU

### FAZA 0 — ZGODY i KLUCZE (decyzje Captian)
- [ ] #5: klucze Shopify app „Cosmic Lands Sync” (scopes: write_products, read_orders, write_orders, write_draft_orders, write_metaobjects, write_product_listings)
- [ ] #18: kierunek numeracji (D) — ROSNĄCO (zgodne z captain.js)
- [ ] Wybór dostawcy NFT: **REKOMENDACJA: thirdweb (sdk engine) przy dużej liczbie mintów / ethers+own RPC (tańsze, zero lock)** — DEcyzja Kapitana
- [ ] Wybór email: **Resend** (free 100/dzień ≈ 3k/mies; Pro $20/mo przy 10k) vs SendGrid (free 100/d) — DE
- [ ] Konta: Pinata (IPFS), Resend, Cloudflare (worker+R2/KV), wallets (operacyjny z ETH na gaz)

### FAZA 1 — INFRA / KONTRAKTY (1–2 dni, wg oznaczeń cloud)
1. **Zakładamy kontrakty lokalnie** — już zrobione, ale na maszynie deweloperskiej:
   ```bash
   cd /opt/data/workspace-cosmiclands-nft && npm install && node scripts/compile.mjs
   ```
   Spodziewane: `build/CosmicLandsDeed.json`, `build/CosmoToken.json`.
2. **Env (bez sekretów w repo):** `.env` z `PRIVATE_KEY` (BGazna), `NETWORK=base-sepolia`.
3. **Deploy testnet (Base Sepolia, chainId 84532):**
   ```bash
   NETWORK=base-sepolia PRIVATE_KEY=0x... node scripts/deploy-nft.mjs
   ```
   → zapisz ADRES kontraktu w `docs/deployed.addresses.md` (testnet).
4. **Deploy COSMO (testnet):** `NETWORK=base-sepolia PRIVATE_KEY=... node scripts/deploy-cosmo.mjs`
5. **Test mintu na testnecie:** `DEED_ADDR=0x... BUYER=0x... node scripts/mint-test.mjs`
6. Weryfikacja na basescan (testnet): https://sepolia.basescan.org/...

**Faza 1 testy:** T5 wg rozdz. 5.

### FAZA 2 — CLOUDFLARE WORKER (routing, HMAC, pipeline)
1. `wrangler init`–w katalogu `worker/` z `worker-sync.mjs` as entry (module worker)
2. `wrangler.toml`: main = "worker-sync.mjs", compat_date, fue: `SHOPIFY_WEBHOOK_SECRET`, `RESEND_API_KEY`, `PINATA_JWT`, `DEED_ADDR`, `COSMO_ADDR`, `WALLET_PK` (Worker secret, nie var)
3. Wgranie sekretów: `wrangler secret put SHOPIFY_WEBHOOK_SECRET` itd.
4. KV: `wrangler kv:namespace create ORDER_CACHE` → wpisz w toml
5. R2: `wrangler r2 bucket create certs` (cdn.cosmiclands.space/certs/…)
6. Dev test: `wrangler dev` + **requesty testowe z `tests/test-webhook-hmac.mjs`** (hasuje Secret)
7. Deploy: `wrangler deploy`

### FAZA 3 — PDF + EMAIL (weryfikacja na samplu)
1. `node scripts/generate-certificate.mjs` — lokalnie generuje PDF (test: `test-output/MARS-PLOT-000042.pdf`)
2. Render PDF jako szablon: dostosować kolor/ekologię (wzory w `assets/certyfikaty/*.png` — do wyboru Kapitana)
3. Upload → R2 (`certs/{plot}.pdf`), URL: `https://cdn.cosmiclands.space/certs/{plot}.pdf`
4. Email: `RESEND_API_KEY=… node scripts/send-email.mjs --to ty@twoj.pl --plot MARS-PLOT-000042` → sprawdź odbiorczy
5. PINATA: upload `nft-metadata/*.json` → CID → zapis w KV (CID index)

### FAZA 4 — SHOPIFY > WORKER (integra)
1. Panel Shopify → **Settings → Notifications → Webhook** nowy: `orders/paid` → URL workera `https://cosmic-lands-sync.TWOJ.workers.dev/webhook`
2. Sekret same webhookowy; ustaw w Workerze `SHOPIFY_WEBHOOK_SECRET`
3. Mapping produktów: upewnić się, że `sku` = `MARS-PLOT-{6}` (= plot_id) — to klucz line item → deed
4. Test paid (order testowy przez Sandbox / actual 1-parcela)
5. **Warunek:** webhook odbity w logach (T3), pipeline mint+PDF+email (T5–T6)

### FAZA 5 — COSMO (ERC-20)
1. Deploy na mainnet (`NETWORK=base …deploy-cosmo.mjs`)
2. Map podaży: **58M sztywna emisja (K 18.08)**, zero dodruku — mint przez worker po zakupie (komercyjne 80/240/720/2160; Genesis pełne 100/300/900/2700); reszta pul (staking 11.6M, nagrody, zespół) — patrz `12-KTO-USTALA-CENE-2026-08-18.md`
3. Lista kont: worker wallets (EIP-3009? — najprościej: worker posiada `mint` — owner) — **owner = kontrakt/worker**
4. Strona `/pages/cosmo-token` (PDF ma gotowy copy); NIE finansowe opisy — utility/collector

### F6 — CERTIFIKAT FIZYCZNY
- Opcjonalny trigger: zapis log (KF) → email cert-shipped + (dzisiaj nie iOS, ręcznie)
- Dane: nr `COSMO-YYYY-####`, QR na grafik (do /verify — jeśli tworzymy RF, póki nie: QR → homepage)

### F7 — GO-LIVE
1. Pełna generacja: `node /opt/opty/zdrowia/generate-mars-manifest-captain.js` → `mars-manifest.json`
2. Import 10k do Shopify (admin CSV, partiami 500–1000, wg testów pilotowych)
3. Bulk publish (CF Worker, jak w pipeline 07)
4. Uruchomienie WORKER_URL w mapie (`index.html` — włączony sync)
5. Smoke test map→buy→PDF→mail→NFT

---

## 2. INSTRUKCJE TECHNICZNE (per artefakt)

### 2.1. `scripts/compile.mjs`
Kompiluje kontrakty z OZ 5.2 przez solc-js (bez hardhata).
- Wyjście: `build/CosmicLandsDeed.json`, `build/CosmoToken.json` (ABI+bytecode)

### 2.2. `deploy-nft.mjs` (Base RPC w env)
- `NETWORK=mainnet|baseRWAsepolia` (chainId 8453/84532)
- `PRIVATE_KEY` — operacyjny klucz (senior sandbox, nie frontend)
- Logika: `RPC_URL`, `DEED constructor(initialBaseURI, maxSupply)`
- maxSupply: 10000 (zgodnie z planem Marsa), potem inne planety → nowe kontrakty (maxSupply per planeta)
- Po deploy: zapis adresu + txHash do `deployed.txt`, weryfikacja na basescan

### 2.3. `mint-test.mjs`
- woła `mintDeed(buyer, plotId, tokenURI)` przez owner; waliduje `tokenURI`, `ownerOf`, `plotToToken`

### 2.4. `worker-sync.mjs` — pełny flow
```
fetch(event) →
  POST /webhook/shopify → verify HMAC-SHA256 (timing-safe) → dedupe (KV order_id)
  → parse: { line_items[0].sku, customer.email, id=order_id }
  → PDF (pdf-lib) → R2 certs/{sku}.pdf
  → metadata (generate + Pinata upload JWT)
  → SimpleDeed.mint (eth_sendRawTransaction przez RPC Base)
  → COSMO.mint (też, owner → buyer)
  → Resend.send (order-confirmation + attachment)
  → Shopify metafield update (status sold)
  → Response 200 { ok: true }
GET /.health → { ok, sha: version }
```

**Zmienne (secrets):**
- `SHOPIFY_WEBHOOK_SECRET` — sklep Shopify
- `RESEND_API_KEY`
- `PINATA_JWT` (metadata IPFS)
- `DEED_ADDR`, `COSMO_ADDR` — po deploy
- `BUYER_*` — nie potrzebne: email klienta z orderu; wallet otrzymuje deed (jeśli klient nie ma walleta → "wstrzymany" / grant na kontrakt, komumentacja)

### 2.5. `generate-certificate.mjs`
- Używa `pdf-lib`, dane z `--plot-id` (albo z manifestu)
- Format A4, dane: plot_id, class, region, area, owner, cert_no (COSMO-YYYY-NNNNNN), data
- Podstrona podpis/QR placehold

### 2.6. `generate-nft-metadata.mjs`
- Wejście: `mars-manifest.json` z captain.js (10k)
- Wyjście: `nft-metadata/MARS-PLOT-*.json` (name/description/image/attributes/registry)

### 2.7. `send-email.mjs`
- Resend API; attachment PDF; bez klucza → DEMO (log only)

---

## 3. WARIANITY (wybór najlepszego — rekomendacje)

| Decyzja | Wariant A | Wariant B | Rekomendacja |
|---|---|---|---|
| Sieć | BASE L2 (8453) | Polygon | **BASE** (K 16.08): taniej, ETH, Coinbase on-ramp |
| NFT minting | **Thirdweb Engine** (`thirdweb/bb` na embed; fee-free deploy) | **ethers+owncast (script)** | **Hybryda:** na start własny ethers (full control, zero vendor); dodaj Thirdweb Engine jeśli ruchy batch’owe do zwiększenia |
| IPFS | nft.storage (WYGASZONE!) | **Pinata** (Free/Picnic) | Pinata Free → Picnic ($20/mo) przy 10k |
| Email | SendGrid | **Resend** | Resend (Pro $20/mo od ~150/mies); SendGrid ratio fallback |
| PDF | pdf-lib in-worker | Puppeteer VPS (cięższy) | **pdf-lib in Worker** (0 serw., instant, CF video); Puppeteer tylko jeśli design wymaga HTML→PDF |
| VestAddress | contract owner (uprosky) | multisig/thirdweb rules | na start: owner=worker (tryb dev-> eager), potem NFT rules z ról |
| Token standard | ERC-721 | ERC-1155 | **ERC-721 per deed** (każda działka unikat) — 1155 dla COSMO bonus (wariant, nie wymagane) |

## 4. RZYMAPTY PEŁNEJ SCENARIUSKI

1. **Best case:** order paid → webhook → 200, PDF+mail+NFT+metafield → status sold w 0–3 s
2. **Webhook Lost** (Shopify retries): webhook ponawiany 3×/48h; Worker idempotent (dedup)
3. **RPC Base down**: retry z backoff (5×, 1s-30s); zapis „pending” w KV; kolejny interwał worker → repair-pipeline
4. **Email fail**: PDF już w R2 — retry mail 3×; alert do operatora
5. **Mint fail**: catch → status pending w KV; alert; ręczny retry skryptem `mint-test.mjs` z tym samym payloadem (idempotencja po plotId)

---

## 5. TESTY AKCEPTACYJNE (wg cosmic-lands-architecture.html)

| # | Test | Oczekiwanie | Realizacja w tym wdrożeniu |
|---|---|---|---|
| T1 | 10000 prod. SHOPIFY | ACTIVE+published, format `mars-plot-*` | import CSV + GraphQL check (F9) |
| T2 | Mapa → koszyk → checkout | działka klik grunt → cart | browser test |
| T3 | Webhook order → Worker log | HMAC OK, event visibility | sup log, T: wd |
| T4 | PDF certyfikat + QR | PDF poprawny , QR → verify | generate-certificate + curl ^R2 (test: 2091 B, T-ok) |
| T5 | NFT mint (testnet) | tx hash w basescan, owner=buyer | deploy + mint-test (Sepolia) |
| T6 | COSMO grant | bal 80/240/720/2160 (komercyjne); Genesis/Rezerwat: pełne 100/300/900/2700 | CosmoToken balance (Sepolia) |
| T7 | Status replikacja → mapa (kupione=Aavailable) | sold z Shopify → mapa | worker sync + mapa | 
| T8 | Sync izolowany | wyłączony → brak wpływu | monkey? nie: test T8 wg „narzędzia” |

**Wszystkie lokalne testy już: `node tests/run-tests.mjs`** (→ exit 0, „Wszystkie testy lokalne PASS”).

---

## 6. KOSZTY (research 16.08, za bazy 11)

| Pozycja | Dostawca | Orientacyjnie |
|---|---|---|
| Gaz Base deploy NFT | ~$1–10 (L1 data) |
| Gas 10 000 mint | ~$0.02–30 (batching) → rzędu ~$10–50 raz |
| IPFS | Pinata Free→Picnic $20/mo (10k JSON+IMG ~50MB) |
| Email | Resend Pro $20/mo (150+ /mies) ; free 3k/mies |
| CF Worker/R2 | Free tier → ~$5–10/mo (do 100k invocations) |
| Wallet gas op. | ~$0.01/order |

**Suma systemu na start: ~$0 /mies (free tiers), do ~$50/mo przy skali.**

---

## 7. BEZPIECZEŃSTWO I ODP

- **HMAC**: porównanie przez `crypto.timingSafeEqual` (już w code)
- **Klucze**: workerów w `wrangler secret`, nigdy w repo/.env (w rzeczach zdalnych)
- **Metamask/keys**: PRIVATE_KEY operacyjny na nowym kluczu (nie użyty niczym innym)
- **Legal**: certyfikat NIE mówi real estate; COSMO = collector utility, NIE finansowe wdrożenie (copy z PDF)
- **Koszt fallback**: jeśli `opsów `wrangler deploy` blokowane — alternatywa lokalny build + `curl` do Cloudflare `--form worker`

---

## 8. ROLLBACK (odwrotne w razie awarii)

1. **Stwierdzenie** (A/B): statusy T1–T8.
2. **Immediate:** `wrangler disable` / ustawić `WORKER_URL=null` w mapie; Shopify webhook „temporarily suspended”
3. **Dane:** PDF/R2 czyści, `burnDeed(tokenId)` (tylko błąd mintowanego nosa? — nie, jeśli sprzedane 3rd—DE: tylko owner do błędu testowego: burn (tylko główny rider), `CosmoToken.burn` — mint)
4. **Wymiana:** CLI deploy poprzedniej wersji worker (git tag) — wrangler rollback; CSV re-import wstecz do stanu poprzedniego (jest snapshot 16.08)

---

## 8. PENDING (decyzje Kapitana blokujące START)

| Blokada | Kto | Co |
|---|---|---|
| Klucze Shopify app (scopes...) | Kapitan | #5 w 99 |
| Decyzja NFT approach: thirdweb vs ethers | Kapitan | rekom.: ethers+Pinata na stają |
| Decyzja email: Resend vs SendGrid | Kapitan | rekom.: Resend |
| Wallet operacyjny (Base) | Kapitan | nowy, bez historii |
| Wybór wzoru certyfikatu (3 PNG) | Kapitan | assets/certyfikaty/ |
| Decyzja: metadata IPFS od razu? | Kapitan | rekom.: tak (Statera) |

---

## 9. PLIKI WSZYSTKICHE (znalezione w trakcie)

- `CosmicLands wiedza.pdf` (197 str.) — skarbnica copyw+NFT+emy: sekcje ~3880–4440 (certyfikat/deed/copy), 5280–5360 (shopify ready), 4195–4260 (What's Included), 4200 (IssuedBy…)
- `cosmiclands-spec/data/reference.yaml` — certyfikat config (fizyczny, PDF, shipping), NFT attrs
- `cosmiclands-spec/data/plots/schema.json` — cert schema `COSMO-2026-00042`, pdf_url CDN
- `PRZYGOTOWANIE-D-NFT.md` / `E-EMAIL.md` — przepływy NFT/email (Base zamiast Polygon)
---

## 10. F1 — LOCK REZERWATU + BANK VAULT (dodane 2026-08-19)

**Problem:** NFT działek rezerwatu (16 000, Genesis) muszą być mintowane terminowo, ale zablokowane do odblokowania planety (10/15/20/25/30/35/40/50 lat). COSMO+NFT jako "bank" — nieporuszalna płynność (timelock).

**Rozwiązanie (2 nowe kontrakty + harmonogram):**
- `contracts/CosmicLandsDeedV2.sol` — V1 + lock transferu:
  - `mintReserveDeed(to, plotId, tokenUri, unlockTimestamp)` — mint z lockiem (onlyOwner)
  - `lockedUntil(tokenId)` — timestamp odblokowania
  - `setUnlockAt(tokenId, ts)` — TYLKO wydłużenie locka (skrócenie REVERT)
  - `_update` nadpisany: transfer przed `lockedUntil` → REVERT "deed locked"
- `contracts/CosmoBankVault.sol` — bank COSMO+NFT:
  - `depositCosmo(amount)` / `depositDeed(tokenId)` — wpłaty (każdy)
  - `withdrawCosmo(to, amount)` / `withdrawDeed(to, tokenId)` — tylko owner (multisig) PO `unlockTime`
  - `unlockTime` — ustawiane w konstruktorze (produkcja: deploy + 10 lat)
- `scripts/mint-reserve-schedule.mjs` — harmonogram: 8 planet × 2000 działek = 16 000, COSMO 9 280 000 (pełne pakiety Genesis 100/300/900/2700); kontrola tokenomiki ✓. DRY-RUN domyślny; `--apply` dopiero po deployu z kluczem.
  - `--planeta Mars --apply` / `--all --apply` / `--rok 2036 --apply`
- `tests/test-lock-runtime.mjs` — runtime test (wymaga `npx hardhat node --port 18546`):
  - T9a mint+lock, transfer przed czasem REVERT
  - T9b transfer po czasie OK
  - T9c skrócenie locka REVERT ×2, wydłużenie OK
  - T10a vault: deposit OK, withdraw przed czasem REVERT (COSMO i NFT), zablokowany deed nie wejdzie do vaulta
  - T10b withdraw po czasie OK
  - T10c komercyjny (bez locka) transfer od razu OK
  - **Wynik: 16/16 PASS (19.08)**

**Testy lokalne:** `npm run test:all` (statyczne) + `npx hardhat node --port 18546` w tle, potem `node tests/test-lock-runtime.mjs` (runtime).

**Uwagi:**
- `compile.mjs` kompiluje 4 kontrakty (V1, V2, COSMO, Vault).
- `hardhat.config.js` + hardhat (devDependency) tylko do testów runtime (EDR, Cancun; ganache nie wspiera PUSH0/mcopy OZ 5.2).
- Deploy produkcji: V2 + Vault po akceptacji Kapitana (D1–D7, patrz 13-PROJEKT-WDROZENIOWY).
