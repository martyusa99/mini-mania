// Producer tags are first come, first served. Claiming one writes a lock file (the store refuses to overwrite it)
// and a key record; the browser that claimed it keeps the key and sends it with every score.
import { put, list } from "@vercel/blob";
import { createHash, randomBytes } from "crypto";

export const TAG_RE = /^[A-Za-z0-9_.-]{1,20}$/;
const hash = key => createHash("sha256").update(String(key)).digest("hex").slice(0, 40);
const low = tag => tag.toLowerCase();

async function save(path, body) {
  const opts = { contentType: "application/json", addRandomSuffix: false, allowOverwrite: false };
  try { return await put(path, body, { access: "private", ...opts }); }
  catch (e) {
    if (/exist/i.test(String(e && e.message))) throw e;
    return await put(path, body, { access: "public", ...opts });
  }
}
export async function keysOf(tag) {
  const r = await list({ prefix: `tagkeys/${low(tag)}~`, limit: 20 });
  return r.blobs.map(b => b.pathname.split("~")[1].replace(/\.json$/, ""));
}
export async function owns(tag, key) {
  if (!key || typeof key !== "string") return false;
  return (await keysOf(tag)).includes(hash(key));
}
export async function isTaken(tag) { return (await keysOf(tag)).length > 0; }
// returns { key } on success, or null when someone else already holds the tag
export async function claim(tag) {
  try { await save(`tags/${low(tag)}.json`, JSON.stringify({ tag, ts: Date.now() })); }
  catch (e) { if (/exist/i.test(String(e && e.message))) return null; throw e; }
  const key = randomBytes(24).toString("base64url");
  await save(`tagkeys/${low(tag)}~${hash(key)}.json`, JSON.stringify({ tag, ts: Date.now() }));
  return { key };
}
