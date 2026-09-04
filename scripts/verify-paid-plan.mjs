// verify-paid-plan.mjs — weryfikacja, czy limit KV writes wzrósł (paid plan) — pośrednio przez API
// Plan Paid: 1M writes/day dla KV; Free: 1k. Nie ma bezpośredniego API "plan", ale GraphQL
// usage/limits dashboardu nie jest publiczny — sprawdzamy operacyjnie: kluczowe metryki żyją.
import fs from 'node:fs';
const t=fs.readFileSync('/opt/data/.secrets/cloudflar.txt','utf8');
const TOKEN=t.match(/cfat_[A-Za-z0-9_-]+/)[0];
const ACC='f0121aafb566d0cfd1cac0289a32eccf';
const api=(p,o={})=>fetch(`https://api.cloudflare.com/client/v4/accounts/${ACC}${p}`,{...o,headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json',...(o.headers||{})}});

// sanity: worker nadal żyje + KV nadal czytelny
const w=await api('/workers/scripts');
const wj=await w.json();
console.log('workers scripts:', wj.success ? wj.result.map(s=>s.id).join(', ') : JSON.stringify(wj.errors));
const kv=await api('/storage/kv/namespaces');
const kj=await kv.json();
console.log('kv namespaces:', kj.success ? kj.result.map(n=>n.title).join(', ') : JSON.stringify(kj.errors));
console.log('OK — konto żywe, worker i KV dostępne (weryfikacja planu = w dashboardzie Billing, API nie eksponuje planu).');
