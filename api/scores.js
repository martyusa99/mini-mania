// MINI MANIA leaderboard: one small file per run in Vercel Blob; the board keeps each producer's best.
import { put, list } from "@vercel/blob";

const TRACKS = new Set(["rotn", "boa", "jxx", "ovm"]);
const DIFFS = new Set(["easy", "normal", "hard"]);
const MAX_SCORE = 2000000;
const TAG_RE = /^[A-Za-z0-9_.-]{1,20}$/;
const IG_RE = /^[A-Za-z0-9._]{1,30}$/;
const clean = (v, n) => (typeof v === "string" ? v : "").trim().replace(/^@+/, "").slice(0, n);

function parse(pathname) {
  // lb/<track>/<diff>/<score>~<tag>~<ig>~<acc x10>~<combo>~<ts>~<rand>.json
  const [score, tag, ig, acc, combo, ts] = pathname.split("/").pop().replace(/\.json$/, "").split("~");
  return { score: +score, tag: decodeURIComponent(tag), ig: ig === "-" ? "" : decodeURIComponent(ig), acc: +acc / 10, combo: +combo, ts: +ts };
}

async function board(track, diff) {
  const rows = [];
  let cursor;
  for (let page = 0; page < 10; page++) {
    const r = await list({ prefix: `lb/${track}/${diff}/`, cursor, limit: 1000 });
    for (const b of r.blobs) { try { rows.push(parse(b.pathname)); } catch (e) {} }
    if (!r.hasMore) break;
    cursor = r.cursor;
  }
  const best = new Map();
  for (const r of rows) {
    const k = r.tag.toLowerCase(), cur = best.get(k);
    if (!cur || r.score > cur.score || (r.score === cur.score && r.ts < cur.ts)) best.set(k, r);
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.ts - b.ts);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const track = String(req.query.track || ""), diff = String(req.query.diff || "");
      if (!TRACKS.has(track) || !DIFFS.has(diff)) return res.status(400).json({ error: "Unknown track or difficulty." });
      const all = await board(track, diff);
      const tag = clean(req.query.tag, 20).toLowerCase();
      const i = tag ? all.findIndex(r => r.tag.toLowerCase() === tag) : -1;
      return res.status(200).json({ top: all.slice(0, 10), total: all.length, you: i >= 0 ? { rank: i + 1, ...all[i] } : null });
    }
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const track = String(b.track || ""), diff = String(b.diff || "");
      const tag = clean(b.tag, 20), ig = clean(b.ig, 30);
      const score = Math.floor(Number(b.score)), acc = Math.round(Number(b.acc) * 10), combo = Math.floor(Number(b.combo));
      if (!TRACKS.has(track) || !DIFFS.has(diff) || !TAG_RE.test(tag) || (ig && !IG_RE.test(ig)) ||
          !(score >= 0 && score <= MAX_SCORE) || !(acc >= 0 && acc <= 1000) || !(combo >= 0 && combo <= 2000)) {
        return res.status(400).json({ error: "That score couldn't be saved." });
      }
      const ts = Date.now(), rand = Math.random().toString(36).slice(2, 8);
      const path = `lb/${track}/${diff}/${String(score).padStart(9, "0")}~${encodeURIComponent(tag)}~${ig ? encodeURIComponent(ig) : "-"}~${acc}~${combo}~${ts}~${rand}.json`;
      const body = JSON.stringify({ track, diff, tag, ig, score, acc: acc / 10, combo, ts });
      try { await put(path, body, { access: "private", contentType: "application/json", addRandomSuffix: false }); }
      catch (e) { await put(path, body, { access: "public", contentType: "application/json", addRandomSuffix: false }); }
      const all = await board(track, diff);
      return res.status(200).json({ ok: true, rank: all.findIndex(r => r.tag.toLowerCase() === tag.toLowerCase()) + 1, total: all.length });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Use GET or POST." });
  } catch (e) {
    return res.status(503).json({ error: "The leaderboard is unavailable right now." });
  }
}
