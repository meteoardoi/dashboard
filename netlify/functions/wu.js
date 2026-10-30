// Proxy seguro hacia Weather Underground
// Variables de entorno en Netlify: WU_API_KEY y WU_STATION_ID
const ALLOWED = {
  current:  "v2/pws/observations/current",
  day:      "v2/pws/observations/all/1day",
  daily7:   "v2/pws/dailysummary/7day",
  history:  "v2/pws/history/daily",
  dayall:   "v2/pws/history/all",          // observaciones de 5 min de un día pasado (para las 24 h)
  forecast: "v3/wx/forecast/daily/5day"
};
const GEOCODE = "42.789,-1.689";
const json = (code, obj, ttl = 0) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}` },
  body: JSON.stringify(obj)
});
exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const path = ALLOWED[q.type];
    if (!path) return json(400, { error: "Tipo no permitido", tipo: q.type || null });
    const key = (process.env.WU_API_KEY || "").trim(), st = (process.env.WU_STATION_ID || "").trim();
    if (!key || !st) return json(500, { error: "Faltan variables de entorno", WU_API_KEY: key ? "OK" : "NO", WU_STATION_ID: st ? "OK" : "NO" });
    const p = new URLSearchParams({ format: "json", units: "m", apiKey: key });
    if (q.type === "forecast") { p.set("geocode", GEOCODE); p.set("language", "es-ES"); }
    else { p.set("stationId", st); p.set("numericPrecision", "decimal"); }
    if (q.type === "history" || q.type === "dayall") {
      if (!/^\d{8}$/.test(q.date || "")) return json(400, { error: "Fecha inválida (AAAAMMDD)" });
      p.set("date", q.date);
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`https://api.weather.com/${path}?${p}`, { signal: ctrl.signal });
    clearTimeout(timer);
    const text = await r.text();
    if (r.status === 204 || !text) return json(200, {}, 60);
    if (!r.ok) return json(r.status, { error: "Weather Underground respondió con error", status: r.status, detalle: text.slice(0, 300) });
    const ttl = q.type === "history" ? 86400 : q.type === "dayall" ? 3600 : q.type === "forecast" ? 1800 : 120;
    return { statusCode: 200, headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}` }, body: text };
  } catch (e) {
    return json(500, { error: "Fallo en la función", detalle: String(e && e.message || e) });
  }
};
