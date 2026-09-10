#!/usr/bin/env node
// run-import-all.mjs — sekwencyjny import 6 planet (Jupiter, Saturn, Mercury, Uranus, Neptune, Pluto).
// Checkpoint: build/import-all-state.json (per planeta: brak → both; 'imported' → tylko fix; 'done' → skip).
// Użycie: node scripts/run-import-all.mjs   (odpalaj w tle; log: build/import-all.log)
// NAPRAWA 10.09: wcześniej --fix powtarzał import (podwójny przebieg, nadpisany raport).
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const PLANETS=['jupiter','saturn','mercury','uranus','neptune','pluto'];
const STATE='build/import-all-state.json';
let state=fs.existsSync(STATE)?JSON.parse(fs.readFileSync(STATE,'utf8')):{};
const log=(m)=>{const l=`[${new Date().toISOString()}] ${m}`;console.log(l);fs.appendFileSync('build/import-all.log',l+'\n');};

log('=== RUN import-all START ===');
for(const pl of PLANETS){
  if(state[pl]==='done'){log(`${pl}: done — skip`);continue;}
  const mf=`build/${pl}-8000-manifest.json`;
  if(!fs.existsSync(mf)){log(`${pl}: BRAK manifestu — skip`);state[pl]='skip';fs.writeFileSync(STATE,JSON.stringify(state,null,1));continue;}
  // faza: jeśli już zaimportowana (state 'imported') → tylko fix; inaczej both
  const arg = state[pl]==='imported' ? '--fix' : '--both';
  log(`--- ${pl}: ${arg} ---`);
  try{ execSync(`node scripts/import-planet.mjs ${pl} ${arg}`,{stdio:'inherit',timeout:0}); }
  catch(e){ log(`${pl}: ERROR ${String(e.message).slice(0,120)}`); state[pl]=arg==='--fix'?'fix-err':'import-err'; fs.writeFileSync(STATE,JSON.stringify(state,null,1)); continue; }
  state[pl]='done';
  fs.writeFileSync(STATE,JSON.stringify(state,null,1));
  log(`=== ${pl}: DONE ===`);
}
log('=== RUN import-all KONIEC ===');
