// Proxy seguro hacia Weather Underground / weather.com
// La API Key y el ID de estación viven en variables de entorno de Netlify:
//   WU_API_KEY  y  WU_STATION_ID
const ALLOWED = {
  current: "v2/pws/observations/current",
  day:     "v2/pws/observations/all/1day",
  hourly7: "v2/pws/observations/hourly/7day",
  daily7:  "v2/pws/dailysummary/7day",
  history: "v2/pws/history/daily",
  forecast:"v3/wx/forecast/daily/5day"
};
// Coordenadas genéricas del municipio (NO de la estación)
const GEOCODE = "42.789,-1.689";

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const path = ALLOWED[q.type];
  if (!path) return { statusCode: 400, body: "tipo no permitido" };
  const key = process.env.WU_API_KEY, st = process.env.WU_STATION_ID;
  if (!key || !st) return { statusCode: 500, body: "Faltan variables de entorno" };

  const p = new URLSearchParams({ format: "json", units: "m", apiKey: key });
  if (q.type === "forecast") { p.set("geocode", GEOCODE); p.set("language", "es-ES"); }
  else { p.set("stationId", st); p.set("numericPrecision", "decimal"); }
  if (q.type === "history") {
    if (!/^\d{8}$/.test(q.date || "")) return { statusCode: 400, body: "fecha inválida" };
    p.set("date", q.date);
  }
  const r = await fetch(`https://api.weather.com/${path}?${p}`);
  const body = await r.text();
  // Caché: datos actuales 2 min, histórico 1 día, previsión 30 min
  const ttl = q.type === "history" ? 86400 : q.type === "forecast" ? 1800 : 120;
  return {
    statusCode: r.status,
    headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}` },
    body: body || "{}"
  };
};
