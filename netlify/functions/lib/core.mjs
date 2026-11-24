// Lógica del espacio de comunidad: foro, novedades, sugerencias y configuración.
// `store` es un almacén clave/valor (Netlify Blobs en producción, memoria en pruebas).
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const DEFAULT_CONFIG = {
  forumOpen: true,          // se pueden abrir temas nuevos
  repliesOpen: true,        // se puede responder en el foro
  premod: false,            // los temas nuevos esperan aprobación antes de verse
  newsComments: true,       // se puede comentar y consultar en Novedades
  welcome: "Un espacio para compartir inquietudes sobre inclusión educativa y construir soluciones entre todas y todos. Contá tu situación y sumá tu experiencia en los temas de otras personas.",
  rules: "Escribí con respeto. No publiques nombres, diagnósticos, fotos ni datos de salud de estudiantes o familias: contá la situación de forma general. Las administradoras pueden editar o quitar mensajes que no cumplan estas pautas.",
  notice: "",
  categories: ["Estrategias en el aula", "Accesibilidad y apoyos", "Normativa y derechos", "Trayectorias y evaluación", "Familias y comunidad", "Otro"],
  admins: ["Laura Repezza", "María Celeste Ahumada"],
};

export const ROLES = ["Docente", "Equipo directivo", "Equipo de apoyo / Inclusión", "Estudiante", "Familia", "Otro"];

const SEED_NEWS = {
  id: "ley-discapacidad-2026",
  title: "El Congreso sancionó la nueva Ley de Discapacidad",
  tag: "Normativa",
  summary: "El 19 de noviembre de 2026 el Senado aprobó por unanimidad la Ley de Fortalecimiento del Sistema de Discapacidad, que reemplaza a la emergencia de la Ley 27.793. Ahora pasa al Poder Ejecutivo para su promulgación.",
  body: [
    "El Senado de la Nación sancionó el jueves 19 de noviembre la Ley de Fortalecimiento del Sistema de Discapacidad, con 71 votos a favor, ninguno en contra y ninguna abstención. La Cámara de Diputados la había aprobado en octubre con 237 votos afirmativos.",
    "La ley transforma en un régimen permanente las herramientas de la Ley 27.793 de Emergencia en Discapacidad, que vence el 31 de diciembre de 2026.",
    "## Qué establece, según lo informado",
    "- Continuidad de las prestaciones básicas de la Ley 24.901.",
    "- Pensiones no contributivas por discapacidad equivalentes al 70% de la jubilación mínima, con actualización automática.",
    "- La pensión se puede cobrar junto con un empleo registrado o el monotributo, si los ingresos no superan dos salarios mínimos, vitales y móviles.",
    "- Cobertura de salud para quienes cobran la pensión, con todas las prestaciones básicas de la Ley 24.901.",
    "- El Certificado Único de Discapacidad (CUD) sigue siendo la llave de acceso a las prestaciones.",
    "- Financiamiento obligatorio en el Presupuesto, actualización de los aranceles de prestadores y un plazo para pagar las deudas pendientes con ellos.",
    "- Auditorías periódicas y publicación de datos en formatos abiertos.",
    "- Capacitación del personal de instituciones y prestadores del sistema.",
    "## ¿Y en la escuela?",
    "Las notas publicadas no mencionan cambios en materia educativa. Los derechos educativos de estudiantes con discapacidad siguen enmarcados en la Ley de Educación Nacional 26.206, la Convención sobre los Derechos de las Personas con Discapacidad (Ley 26.378, con jerarquía constitucional por la Ley 27.044) y la Resolución CFE 311/16.",
    "## Próximos pasos",
    "Falta la promulgación y la publicación en el Boletín Oficial. Cuando esté el texto oficial vamos a actualizar esta novedad. Si tenés dudas sobre cómo te alcanza, tocá «Consultar el alcance» y te respondemos.",
  ].join("\n"),
  links: [
    { label: "Parlamentario: el Senado convirtió en ley la reforma", url: "https://www.parlamentario.com/2026/11/19/discapacidad-el-senado-convirtio-en-ley-una-reforma-integral-para-fortalecer-el-sistema-de-proteccion-y-prestaciones/" },
    { label: "Perfil: sanción por unanimidad", url: "https://perfil.com/politica/el-senado-sanciono-por-unanimidad-la-ley-de-discapacidad-aDCMV1g8TxqC" },
    { label: "Diario Panorama: qué cambia para pensiones y prestaciones", url: "https://diariopanorama.com/noticia/573560/senado-aprobo-pornimidad-nueva-ley-discapacidad-cambia-para-pensiones-prestaciones" },
  ],
  author: "Equipo de Inclusión · DGETyFP",
  pinned: true,
  created: "2026-11-23T10:00:00.000Z",
};

/* ---------------- utilidades ---------------- */
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const err = (msg, status = 400) => json({ error: msg }, status);
const now = () => new Date().toISOString();
const newId = () => Date.now().toString(36) + randomBytes(3).toString("hex");
const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
const clip = (s, n) => String(s ?? "").replace(/\r/g, "").trim().slice(0, n);
const bool = (v) => v === true || v === "true";

function isAdmin(req, adminKey) {
  const k = req.headers.get("x-admin-key") || "";
  if (!adminKey || !k) return false;
  const a = Buffer.from(sha(k)), b = Buffer.from(sha(adminKey));
  return a.length === b.length && timingSafeEqual(a, b);
}

async function getConfig(store) {
  const c = (await store.get("config", { type: "json" })) || {};
  return { ...DEFAULT_CONFIG, ...c };
}

async function list(store, prefix) {
  const { blobs } = await store.list({ prefix });
  const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return items.filter(Boolean);
}

async function ensureSeed(store) {
  if (await store.get("meta/seeded", { type: "json" })) return;
  await store.setJSON("news/" + SEED_NEWS.id, { ...SEED_NEWS, comments: [], reactions: {} });
  await store.setJSON("meta/seeded", { at: now() });
}

// Límite simple de envíos por dirección IP (antispam)
async function rateLimit(store, ip, max = 8, windowMs = 10 * 60 * 1000) {
  if (!ip) return true;
  const key = "rl/" + sha(ip).slice(0, 24);
  const t = Date.now();
  const arr = ((await store.get(key, { type: "json" })) || []).filter((x) => t - x < windowMs);
  if (arr.length >= max) return false;
  arr.push(t);
  await store.setJSON(key, arr);
  return true;
}

// Quita datos internos antes de mandar al navegador
function pubItem(it) {
  const { ownerHash, ip, ...rest } = it;
  return rest;
}
function pubTopic(t, admin) {
  const o = pubItem(t);
  o.replies = (t.replies || []).filter((r) => admin || r.approved !== false).map(pubItem);
  return o;
}
function pubNews(n, admin) {
  const o = pubItem(n);
  o.comments = (n.comments || []).filter((c) => admin || c.approved !== false).map(pubItem);
  return o;
}

function ownerOk(item, body) {
  return item.ownerHash && body && body.token && sha(body.token) === item.ownerHash;
}

function author(body) {
  return { author: clip(body.author, 60) || "Anónimo", role: ROLES.includes(body.role) ? body.role : "" };
}

function spamCheck(body) {
  // Campo trampa invisible y tiempo mínimo de escritura
  if (body.website) return "spam";
  if (body.t && Date.now() - Number(body.t) < 2500) return "spam";
  return null;
}

/* ---------------- manejador principal ---------------- */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,x-sala-key",
  "access-control-max-age": "86400",
};
export async function handle(req, ctx) {
  const url = new URL(req.url);
  const isSala = /\/api\/salas(\/|$)/.test(url.pathname);
  if (isSala && req.method.toUpperCase() === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const res = await handleInner(req, ctx);
  if (!isSala) return res;
  const hd = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) hd.set(k, v);
  return new Response(res.body, { status: res.status, headers: hd });
}

async function handleInner(req, { store, adminKey, ip }) {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/(\.netlify\/functions\/)?api\/?/, "").split("/").filter(Boolean);
  const method = req.method.toUpperCase();
  let body = {};
  if (method !== "GET" && method !== "HEAD") {
    try { body = await req.json(); } catch { body = {}; }
  }
  const admin = isAdmin(req, adminKey);
  const needAdmin = () => (admin ? null : err("Solo las administradoras pueden hacer esto. Volvé a ingresar con la clave.", 401));

  try {
    await ensureSeed(store);
    const [col, id, sub, subId, action] = parts;

    /* ---- sesión ---- */
    if (col === "login" && method === "POST") {
      if (!adminKey) return err("Todavía no se configuró la clave de administración en Netlify (variable ADMIN_KEY).", 503);
      const ok = isAdmin(new Request(req.url, { headers: { "x-admin-key": String(body.key || "") } }), adminKey);
      return ok ? json({ ok: true }) : err("Clave incorrecta", 401);
    }

    /* ---- configuración ---- */
    if (col === "config") {
      if (method === "GET") return json({ config: await getConfig(store), roles: ROLES, admin, adminReady: !!adminKey });
      if (method === "PUT") {
        const d = needAdmin(); if (d) return d;
        const cur = await getConfig(store);
        const next = { ...cur };
        for (const k of ["forumOpen", "repliesOpen", "premod", "newsComments"]) if (k in body) next[k] = bool(body[k]);
        for (const [k, n] of [["welcome", 1200], ["rules", 1500], ["notice", 400]]) if (k in body) next[k] = clip(body[k], n);
        if (Array.isArray(body.categories)) {
          const cats = body.categories.map((c) => clip(c, 50)).filter(Boolean).slice(0, 15);
          if (cats.length) next.categories = [...new Set(cats)];
        }
        if (Array.isArray(body.admins)) {
          const ad = body.admins.map((c) => clip(c, 60)).filter(Boolean).slice(0, 6);
          if (ad.length) next.admins = ad;
        }
        await store.setJSON("config", next);
        return json({ config: next });
      }
    }

    /* ---- foro ---- */
    if (col === "topics") {
      const cfg = await getConfig(store);
      if (!id) {
        if (method === "GET") {
          const all = (await list(store, "topics/")).filter((t) => admin || t.approved !== false);
          return json({ topics: all.map((t) => pubTopic(t, admin)) });
        }
        if (method === "POST") {
          if (spamCheck(body)) return json({ ok: true, ignored: true });
          if (!cfg.forumOpen && !admin) return err("Por ahora no se pueden abrir temas nuevos.", 403);
          const title = clip(body.title, 140), text = clip(body.body, 5000);
          if (title.length < 5 || text.length < 10) return err("Escribí un título y una descripción un poco más largos.");
          if (!admin && !(await rateLimit(store, ip))) return err("Enviaste muchos mensajes seguidos. Esperá unos minutos.", 429);
          const token = randomBytes(16).toString("hex");
          const t = {
            id: newId(), title, body: text, cat: cfg.categories.includes(body.cat) ? body.cat : cfg.categories[cfg.categories.length - 1],
            ...author(body), created: now(), updated: now(), replies: [], metoo: 0, pinned: false, closed: false,
            approved: admin || !cfg.premod, byAdmin: admin, ownerHash: sha(token),
          };
          await store.setJSON("topics/" + t.id, t);
          return json({ topic: pubTopic(t, true), token });
        }
      } else {
        const key = "topics/" + id;
        const t = await store.get(key, { type: "json" });
        if (!t || (t.approved === false && !admin && !ownerOk(t, body))) return err("Ese tema no existe o fue quitado.", 404);
        if (!sub) {
          if (method === "GET") return json({ topic: pubTopic(t, admin) });
          if (method === "PATCH") {
            if (!admin && !ownerOk(t, body)) return err("No podés editar este tema.", 403);
            if ("title" in body) t.title = clip(body.title, 140) || t.title;
            if ("body" in body) t.body = clip(body.body, 5000) || t.body;
            if ("cat" in body && cfg.categories.includes(body.cat)) t.cat = body.cat;
            if (admin) {
              for (const k of ["pinned", "closed", "approved"]) if (k in body) t[k] = bool(body[k]);
              if ("solution" in body) t.solution = body.solution || null;
            }
            t.updated = now();
            await store.setJSON(key, t);
            return json({ topic: pubTopic(t, admin) });
          }
          if (method === "DELETE") {
            if (!admin && !ownerOk(t, body)) return err("No podés borrar este tema.", 403);
            await store.delete(key);
            return json({ ok: true });
          }
        }
        if (sub === "metoo" && method === "POST") {
          t.metoo = (t.metoo || 0) + (body.undo ? -1 : 1);
          if (t.metoo < 0) t.metoo = 0;
          await store.setJSON(key, t);
          return json({ metoo: t.metoo });
        }
        if (sub === "replies") {
          if (!subId && method === "POST") {
            if (spamCheck(body)) return json({ ok: true, ignored: true });
            if ((!cfg.repliesOpen || t.closed) && !admin) return err("Este tema no admite respuestas nuevas.", 403);
            const text = clip(body.body, 4000);
            if (text.length < 3) return err("Escribí tu respuesta.");
            if (!admin && !(await rateLimit(store, ip))) return err("Enviaste muchos mensajes seguidos. Esperá unos minutos.", 429);
            const token = randomBytes(16).toString("hex");
            const r = { id: newId(), body: text, ...author(body), created: now(), util: 0, byAdmin: admin, approved: true, ownerHash: sha(token) };
            if (admin && body.adminName) r.author = clip(body.adminName, 60);
            t.replies = [...(t.replies || []), r];
            t.updated = now();
            await store.setJSON(key, t);
            return json({ topic: pubTopic(t, admin), token, replyId: r.id });
          }
          const r = (t.replies || []).find((x) => x.id === subId);
          if (!r) return err("Esa respuesta no existe.", 404);
          if (action === "util" && method === "POST") {
            r.util = Math.max(0, (r.util || 0) + (body.undo ? -1 : 1));
            await store.setJSON(key, t);
            return json({ topic: pubTopic(t, admin) });
          }
          if (method === "PATCH") {
            if (!admin && !ownerOk(r, body)) return err("No podés editar esta respuesta.", 403);
            if ("body" in body) r.body = clip(body.body, 4000) || r.body;
            r.edited = now();
            await store.setJSON(key, t);
            return json({ topic: pubTopic(t, admin) });
          }
          if (method === "DELETE") {
            if (!admin && !ownerOk(r, body)) return err("No podés borrar esta respuesta.", 403);
            t.replies = t.replies.filter((x) => x.id !== subId);
            if (t.solution === subId) t.solution = null;
            await store.setJSON(key, t);
            return json({ topic: pubTopic(t, admin) });
          }
        }
      }
    }

    /* ---- novedades ---- */
    if (col === "news") {
      const cfg = await getConfig(store);
      const readNews = (b) => ({
        title: clip(b.title, 160), tag: clip(b.tag, 40), summary: clip(b.summary, 600), body: clip(b.body, 12000),
        links: (Array.isArray(b.links) ? b.links : []).map((l) => ({ label: clip(l.label, 120), url: clip(l.url, 500) }))
          .filter((l) => /^https?:\/\//i.test(l.url)).slice(0, 8),
        author: clip(b.author, 80),
      });
      if (!id) {
        if (method === "GET") return json({ news: (await list(store, "news/")).map((n) => pubNews(n, admin)) });
        if (method === "POST") {
          const d = needAdmin(); if (d) return d;
          const n = { id: newId(), ...readNews(body), pinned: bool(body.pinned), created: now(), comments: [], reactions: {} };
          if (n.title.length < 3) return err("Falta el título.");
          if (!n.author) n.author = cfg.admins[0];
          await store.setJSON("news/" + n.id, n);
          return json({ item: pubNews(n, true) });
        }
      } else {
        const key = "news/" + id;
        const n = await store.get(key, { type: "json" });
        if (!n) return err("Esa novedad no existe o fue quitada.", 404);
        if (!sub) {
          if (method === "GET") return json({ item: pubNews(n, admin) });
          if (method === "PATCH") {
            const d = needAdmin(); if (d) return d;
            const u = readNews({ ...n, ...body });
            Object.assign(n, u, { pinned: "pinned" in body ? bool(body.pinned) : n.pinned, edited: now() });
            await store.setJSON(key, n);
            return json({ item: pubNews(n, true) });
          }
          if (method === "DELETE") {
            const d = needAdmin(); if (d) return d;
            await store.delete(key);
            return json({ ok: true });
          }
        }
        if (sub === "react" && method === "POST") {
          const k = ["util", "interesa", "gracias"].includes(body.kind) ? body.kind : null;
          if (!k) return err("Reacción no válida");
          n.reactions = n.reactions || {};
          n.reactions[k] = Math.max(0, (n.reactions[k] || 0) + (body.undo ? -1 : 1));
          await store.setJSON(key, n);
          return json({ item: pubNews(n, admin) });
        }
        if (sub === "comments") {
          if (!subId && method === "POST") {
            if (spamCheck(body)) return json({ ok: true, ignored: true });
            if (!cfg.newsComments && !admin) return err("Los comentarios están desactivados por ahora.", 403);
            const text = clip(body.body, 3000);
            if (text.length < 3) return err("Escribí tu comentario.");
            if (!admin && !(await rateLimit(store, ip))) return err("Enviaste muchos mensajes seguidos. Esperá unos minutos.", 429);
            const token = randomBytes(16).toString("hex");
            const c = { id: newId(), type: body.type === "consulta" ? "consulta" : "comentario", body: text, ...author(body), created: now(), byAdmin: admin, ownerHash: sha(token) };
            if (admin && body.adminName) c.author = clip(body.adminName, 60);
            n.comments = [...(n.comments || []), c];
            await store.setJSON(key, n);
            return json({ item: pubNews(n, admin), token, commentId: c.id });
          }
          const c = (n.comments || []).find((x) => x.id === subId);
          if (!c) return err("Ese comentario no existe.", 404);
          if (method === "PATCH") {
            if (admin && "answer" in body) {
              const a = clip(body.answer, 3000);
              c.answer = a ? { body: a, by: clip(body.adminName, 60) || cfg.admins[0], at: now() } : null;
            } else if (ownerOk(c, body) || admin) {
              if ("body" in body) c.body = clip(body.body, 3000) || c.body;
              c.edited = now();
            } else return err("No podés editar este comentario.", 403);
            await store.setJSON(key, n);
            return json({ item: pubNews(n, admin) });
          }
          if (method === "DELETE") {
            if (!admin && !ownerOk(c, body)) return err("No podés borrar este comentario.", 403);
            n.comments = n.comments.filter((x) => x.id !== subId);
            await store.setJSON(key, n);
            return json({ item: pubNews(n, admin) });
          }
        }
      }
    }

    /* ---- salas compartidas del sondeo ----
       Quien coordina crea una sala y recibe un código (para compartir) y una clave (para ver los resultados).
       Cada participante envía su resultado con el código. Las salas se borran solas a los 30 días. */
    if (col === "salas") {
      const code = String(id || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
      const metaKey = "salas/" + code + "/meta";
      const getSala = async () => {
        const s = code ? await store.get(metaKey, { type: "json" }) : null;
        if (s && Date.now() - Date.parse(s.created) > 30 * 864e5) return null;
        return s;
      };
      const keyOk = (s) => { const k = req.headers.get("x-sala-key") || url.searchParams.get("k") || ""; return !!k && sha(k) === s.keyHash; };
      if (!id && method === "POST") {
        if (spamCheck(body)) return err("No se pudo crear la sala.");
        if (!(await rateLimit(store, ip, 20))) return err("Creaste muchas salas seguidas. Esperá unos minutos.", 429);
        const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let c = "";
        for (let t = 0; t < 8; t++) {
          c = Array.from(randomBytes(5), (b) => ABC[b % ABC.length]).join("");
          if (!(await store.get("salas/" + c + "/meta", { type: "json" }))) break;
        }
        const key = randomBytes(12).toString("hex");
        const s = { code: c, nombre: clip(body.nombre, 80) || "Sala sin nombre", created: now(), keyHash: sha(key) };
        await store.setJSON("salas/" + c + "/meta", s);
        return json({ code: c, key, nombre: s.nombre, created: s.created });
      }
      const s = await getSala();
      if (!s) return err("No encontramos esa sala. Revisá el código o pedile uno nuevo a quien coordina.", 404);
      if (!sub && method === "GET") {
        const pub = { code: s.code, nombre: s.nombre, created: s.created };
        if (!keyOk(s)) return json({ sala: pub });
        const rs = await list(store, "salas/" + code + "/r/");
        rs.sort((a, b) => a.created.localeCompare(b.created));
        return json({ sala: pub, resultados: rs });
      }
      if (!sub && method === "DELETE") {
        if (!keyOk(s)) return err("Solo quien creó la sala puede cerrarla.", 401);
        const { blobs } = await store.list({ prefix: "salas/" + code + "/" });
        await Promise.all(blobs.map((b) => store.delete(b.key)));
        return json({ ok: true });
      }
      if (sub === "resultados" && method === "POST") {
        if (!(await rateLimit(store, ip, 60))) return err("Se enviaron muchos resultados seguidos desde esta conexión. Esperá unos minutos.", 429);
        const inst = clip(body.inst, 20), type = clip(body.type, 10);
        if (!["vak", "hemi", "cuad"].includes(type)) return err("Resultado inválido.");
        const counts = {};
        if (body.counts && typeof body.counts === "object") for (const [k, v] of Object.entries(body.counts).slice(0, 8)) counts[clip(k, 4)] = Math.max(0, Math.min(200, Number(v) || 0));
        const top = Array.isArray(body.top) ? body.top.slice(0, 4).map((x) => clip(x, 4)) : [];
        const existing = await store.list({ prefix: "salas/" + code + "/r/" });
        if (existing.blobs.length >= 300) return err("La sala ya tiene 300 resultados. Pedile a quien coordina que abra otra.");
        const r = { id: newId(), alias: clip(body.alias, 60) || "Sin nombre", inst, type, label: clip(body.label, 120), nivel: clip(body.nivel, 40), counts, top, n: Math.max(0, Math.min(200, Number(body.n) || 0)), created: now() };
        await store.setJSON("salas/" + code + "/r/" + r.id, r);
        return json({ ok: true });
      }
      if (sub === "resultados" && subId && method === "DELETE") {
        if (!keyOk(s)) return err("Solo quien creó la sala puede quitar resultados.", 401);
        await store.delete("salas/" + code + "/r/" + clip(subId, 40));
        return json({ ok: true });
      }
    }

    /* ---- sugerencias de mejora ---- */
    if (col === "suggestions") {
      if (!id && method === "POST") {
        if (spamCheck(body)) return json({ ok: true, ignored: true });
        const text = clip(body.body, 3000);
        if (text.length < 5) return err("Contanos un poco más tu sugerencia.");
        if (!(await rateLimit(store, ip))) return err("Enviaste muchos mensajes seguidos. Esperá unos minutos.", 429);
        const s = { id: newId(), kind: clip(body.kind, 40) || "Idea", body: text, contact: clip(body.contact, 120), page: clip(body.page, 60), created: now(), status: "nueva" };
        await store.setJSON("suggestions/" + s.id, s);
        return json({ ok: true });
      }
      const d = needAdmin(); if (d) return d;
      if (!id && method === "GET") return json({ suggestions: await list(store, "suggestions/") });
      const key = "suggestions/" + id;
      const s = await store.get(key, { type: "json" });
      if (!s) return err("No existe", 404);
      if (method === "PATCH") { s.status = ["nueva", "revisada", "hecha"].includes(body.status) ? body.status : s.status; s.note = clip(body.note ?? s.note, 500); await store.setJSON(key, s); return json({ item: s }); }
      if (method === "DELETE") { await store.delete(key); return json({ ok: true }); }
    }

    return err("Ruta no encontrada", 404);
  } catch (e) {
    console.error(e);
    return err("Ocurrió un error en el servidor. Probá de nuevo en un momento.", 500);
  }
}
