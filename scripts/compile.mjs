#!/usr/bin/env node
// compile.mjs — kompilacja kontraktów przez solc-js (bez hardhata, do deploy przez ethers)
import solc from 'solc';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const contractsDir = path.join(root, 'contracts');
const outDir = path.join(root, 'build');
fs.mkdirSync(outDir, { recursive: true });

const contracts = ['CosmicLandsDeed.sol', 'CosmicLandsDeedV2.sol', 'CosmoToken.sol', 'CosmoBankVault.sol'];
const sources = {};
const basePath = path.resolve(root, 'node_modules');

// Klucze źródeł = nazwy importów (tak je widzi solc), ścieżka fizyczna = mapowanie node_modules/contracts
function resolveImport(imp, importerKey) {
  // importerKey: jednostka źródłowa (np. 'contracts/CosmicLandsDeed.sol' albo '@openzeppelin/contracts/x.sol')
  let key;
  if (imp.startsWith('@openzeppelin')) {
    key = imp;
  } else if (imp.startsWith('.')) {
    key = path.posix.normalize(path.posix.join(path.posix.dirname(importerKey), imp));
  } else {
    key = imp;
  }
  if (!key.endsWith('.sol')) key += '.sol';

  // fizyczna lokalizacja
  let filePath;
  if (key.startsWith('@openzeppelin')) {
    filePath = path.join(basePath, key);
  } else if (key.startsWith('contracts/')) {
    filePath = path.join(root, key);
  } else {
    filePath = path.join(root, key);
  }
  return { key, filePath };
}

function collect(filePath, key) {
  const src = fs.readFileSync(filePath, 'utf8');
  sources[key] = { content: src };
  const importRe = /import\s+(?:{[^}]*}\s+from\s+)?["']([^"']+)["']/g;
  let m;
  const seen = new Set();
  while ((m = importRe.exec(src))) {
    const imp = m[1];
    const sig = imp + '@' + key;
    if (seen.has(sig)) continue;
    seen.add(sig);
    const { key: impKey, filePath: impPath } = resolveImport(imp, key);
    if (!fs.existsSync(impPath)) {
      console.error('BRAK IMPORTU:', imp, '->', impPath);
      continue;
    }
    if (!sources[impKey]) {
      collect(impPath, impKey);
    }
  }
}

for (const c of contracts) collect(path.join(contractsDir, c), 'contracts/' + c);

console.log('Źródła zebrane:', Object.keys(sources).length);
const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
if (output.errors) {
  const fatal = output.errors.filter(e => e.severity === 'error');
  for (const e of output.errors) {
    console.error(`[${e.severity}] ${e.formattedMessage.slice(0, 400)}`);
  }
  if (fatal.length) { process.exit(1); }
}

for (const c of contracts) {
  const name = c.replace('.sol', '');
  const sourceKey = Object.keys(sources).find(k => k.endsWith('/' + c)) || 'contracts/' + c;
  const artifact = output.contracts[sourceKey]?.[name];
  if (!artifact) { console.error('BRAK ARTEFAKTU:', sourceKey); continue; }
  fs.writeFileSync(path.join(outDir, name + '.json'), JSON.stringify({
    abi: artifact.abi,
    bytecode: '0x' + artifact.evm.bytecode.object,
  }, null, 2));
  console.log(`✅ ${name} → build/${name}.json (ABI + bytecode)`);
}
console.log('Kompilacja OK.');