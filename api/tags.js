// GET /api/tags?tag=name  -> { tag, available }
// POST { tag, key? }      -> { ok, tag, key } when the tag is yours (newly claimed, or the key matches); 409 when it's taken
import { TAG_RE, owns, isTaken, claim } from "./_tags.js";
const clean = v => (typeof v === "string" ? v : "").trim().replace(/^@+/, "").slice(0, 20);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const tag = clean(req.query.tag);
      if (!TAG_RE.test(tag)) return res.status(400).json({ error: "Tags use letters, numbers, dots, dashes or underscores." });
      return res.status(200).json({ tag, available: !(await isTaken(tag)) });
    }
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const tag = clean(b.tag);
      if (!TAG_RE.test(tag)) return res.status(400).json({ error: "Tags use letters, numbers, dots, dashes or underscores." });
      if (b.key && await owns(tag, b.key)) return res.status(200).json({ ok: true, tag, key: b.key });
      const got = await claim(tag);
      if (!got) return res.status(409).json({ error: `@${tag} is already taken. Pick another tag.` });
      return res.status(200).json({ ok: true, tag, key: got.key, claimed: true });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Use GET or POST." });
  } catch (e) {
    return res.status(503).json({ error: "Tags can't be checked right now." });
  }
}
