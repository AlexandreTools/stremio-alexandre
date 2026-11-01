// Builds a static Stremio add-on (catalogues only) into docs/, served by GitHub Pages.
// Rows:
//   - "Au cinéma": films showing in French cinemas now (TMDB now_playing, region FR),
//     the ones Stremio's own "Popular" catalogue also lists first, then the most popular others.
//   - "Classiques à rattraper": very well rated films with lots of votes (TMDB top rated), a fresh pick each day.
// Run: TMDB_KEY=... node build.mjs   (v3 API key or v4 read access token). No dependencies (Node 20+).
// Data and images: TMDB (https://www.themoviedb.org). This product uses the TMDB API but is not endorsed
// or certified by TMDB.
import { mkdir, writeFile } from 'node:fs/promises';

const KEY = (process.env.TMDB_KEY || '').trim();
if (!KEY) { console.error('TMDB_KEY is missing'); process.exit(1); }
const BEARER = KEY.length > 40; // v4 read access token vs v3 api key
const OUT = 'docs';
const ROW_SIZE = 20;

async function tmdb(path, params = {}) {
  const u = new URL('https://api.themoviedb.org/3' + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (!BEARER) u.searchParams.set('api_key', KEY);
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(u, { headers: BEARER ? { Authorization: 'Bearer ' + KEY, Accept: 'application/json' } : { Accept: 'application/json' } });
    if (r.status === 429) { await new Promise(s => setTimeout(s, 2000)); continue; }
    if (!r.ok) throw new Error(`TMDB ${path}: HTTP ${r.status}`);
    return r.json();
  }
  throw new Error(`TMDB ${path}: rate limited`);
}

async function json(url) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

/** TMDB film -> Stremio catalogue entry (needs the IMDb id, which Stremio and its stream add-ons use). */
async function toMeta(m) {
  const d = await tmdb(`/movie/${m.id}`, { language: 'fr-FR', append_to_response: 'external_ids' });
  const imdb = d.imdb_id || d.external_ids?.imdb_id;
  if (!imdb || !imdb.startsWith('tt')) return null;
  return {
    id: imdb,
    type: 'movie',
    name: d.title || m.title,
    poster: d.poster_path ? `https://image.tmdb.org/t/p/w342${d.poster_path}` : `https://images.metahub.space/poster/medium/${imdb}/img`,
    posterShape: 'poster',
    background: d.backdrop_path ? `https://image.tmdb.org/t/p/w1280${d.backdrop_path}` : undefined,
    description: d.overview || undefined,
    releaseInfo: (d.release_date || '').slice(0, 4) || undefined,
    genres: (d.genres || []).map(g => g.name),
  };
}

async function metasFor(list) {
  const out = [];
  for (const m of list) {
    if (out.length >= ROW_SIZE) break;
    try {
      const meta = await toMeta(m);
      if (meta && !out.some(x => x.id === meta.id)) out.push(meta);
    } catch (e) { console.warn(String(e)); }
  }
  return out;
}

async function pages(path, params, n) {
  const all = [];
  for (let p = 1; p <= n; p++) {
    const r = await tmdb(path, { ...params, page: String(p) });
    all.push(...(r.results || []));
    if (p >= (r.total_pages || 1)) break;
  }
  return all;
}

// ---------------------------------------------------------------- Au cinéma
async function cinema() {
  // Only real new releases: out in the last 70 days (TMDB's list also has re-releases of old films),
  // and with a title in a Latin alphabet (some films have no French title yet).
  const since = new Date(Date.now() - 70 * 86400000).toISOString().slice(0, 10);
  const playing = (await pages('/movie/now_playing', { language: 'fr-FR', region: 'FR' }, 5))
    .filter(m => (m.release_date || '') >= since && /[A-Za-zÀ-ÿ]/.test(m.title || ''));
  playing.sort((a, b) => b.popularity - a.popularity);
  // Stremio's own "Popular" films first (same idea as its home screen), matched by IMDb id after conversion.
  let stremioTop = new Set();
  try {
    const cm = await json('https://v3-cinemeta.strem.io/catalog/movie/top.json');
    stremioTop = new Set((cm.metas || []).map(x => x.imdb_id || x.id));
  } catch (e) { console.warn('cinemeta: ' + e); }
  const metas = await metasFor(playing.slice(0, 40));
  metas.sort((a, b) => (stremioTop.has(b.id) ? 1 : 0) - (stremioTop.has(a.id) ? 1 : 0));
  console.log(`au cinéma: ${metas.length} films (${metas.filter(m => stremioTop.has(m.id)).length} aussi populaires sur Stremio)`);
  return metas;
}

// ---------------------------------------------------------------- Classiques à rattraper
function dailyShuffle(arr) {
  // Same order all day, a new one the next day.
  let seed = Math.floor(Date.now() / 86400000);
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

async function classics() {
  const top = await pages('/movie/top_rated', { language: 'fr-FR' }, 10);
  // Classics: at least 10 years old, very well rated by many people.
  const before = new Date(Date.now() - 10 * 365 * 86400000).toISOString().slice(0, 10);
  const good = top.filter(m => m.vote_count >= 3000 && m.vote_average >= 8.0 && (m.release_date || '9') < before);
  const metas = await metasFor(dailyShuffle(good));
  console.log(`classiques: ${metas.length} films (parmi ${good.length})`);
  return metas;
}

// ---------------------------------------------------------------- write the add-on
const catalogs = [
  { type: 'movie', id: 'au-cinema', name: 'Au cinéma', build: cinema },
  { type: 'movie', id: 'classiques', name: 'Classiques à rattraper', build: classics },
];

const manifest = {
  id: 'com.alexandre.recos',
  version: '1.0.' + Math.floor(Date.now() / 86400000),
  name: 'Recos Alexandre',
  description: 'Au cinéma et classiques à rattraper. Données TMDB, mises à jour chaque nuit.',
  resources: ['catalog'],
  types: ['movie'],
  idPrefixes: ['tt'],
  catalogs: catalogs.map(({ type, id, name }) => ({ type, id, name })),
  behaviorHints: { configurable: false, configurationRequired: false },
};

await mkdir(`${OUT}/catalog/movie`, { recursive: true });
await writeFile(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));
for (const c of catalogs) {
  let metas = [];
  try { metas = await c.build(); } catch (e) { console.error(`${c.id}: ${e}`); }
  if (metas.length) await writeFile(`${OUT}/catalog/${c.type}/${c.id}.json`, JSON.stringify({ metas }));
  else console.warn(`${c.id}: nothing new, keeping the previous file`);
}
await writeFile(`${OUT}/.nojekyll`, '');
await writeFile(`${OUT}/index.html`, `<!doctype html><meta charset="utf-8"><title>Recos Alexandre</title>
<p>Add-on Stremio perso. Dans Stremio, ajouter l'add-on avec l'adresse de <code>manifest.json</code>.</p>
<p>Données et images : <a href="https://www.themoviedb.org">TMDB</a>. Ce produit utilise l'API TMDB sans être approuvé ni certifié par TMDB.</p>`);
console.log('ok');
