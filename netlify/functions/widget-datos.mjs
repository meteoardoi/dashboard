// Datos compactos para el widget de Meteo Ardoi (webs de terceros)
// - Solo datos de la estación (nada de la previsión de The Weather Company)
// - Caché en el CDN de Netlify (5 min) + caché en memoria: muchas visitas = muy pocas consultas a WU
// Usa las mismas variables de entorno que wu.js: WU_API_KEY y WU_STATION_ID
let MEM = { ts: 0, data: null };
const TTL_MS = 120000;

const headers = (sec) => ({
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": `public, max-age=${Math.min(sec, 120)}`,
  "Netlify-CDN-Cache-Control": `public, durable, s-maxage=${sec}, stale-while-revalidate=120`
});

async function wu(path, extra = {}) {
  const p = new URLSearchParams({
    stationId: (process.env.WU_STATION_ID || "").trim(), format: "json", units: "m",
    numericPrecision: "decimal", apiKey: (process.env.WU_API_KEY || "").trim(), ...extra
  });
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch(`https://api.weather.com/${path}?${p}`, { signal: ctrl.signal });
    if (r.status === 204) return {};
    if (!r.ok) throw new Error("WU HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

export default async () => {
  if (MEM.data && Date.now() - MEM.ts < TTL_MS) return Response.json(MEM.data, { headers: headers(300) });
  try {
    const [c, d] = await Promise.all([
      wu("v2/pws/observations/current"),
      wu("v2/pws/observations/all/1day").catch(() => ({}))
    ]);
    const o = (c.observations || [])[0];
    if (!o || !o.metric) throw new Error("La estación no ha enviado datos");
    const m = o.metric, L = (d.observations || []).filter(x => x && x.metric);
    const num = v => (v === null || v === undefined || isNaN(v)) ? null : +v;
    const hi = L.map(x => num(x.metric.tempHigh)).filter(v => v !== null);
    const lo = L.map(x => num(x.metric.tempLow)).filter(v => v !== null);
    const data = {
      epoch: o.epoch, lat: num(o.lat), lon: num(o.lon),
      temp: num(m.temp), feel: num(m.temp) !== null && m.temp <= 10 ? num(m.windChill) : num(m.heatIndex),
      hum: num(o.humidity), wind: num(m.windSpeed), gust: num(m.windGust), dir: num(o.winddir),
      rain: num(m.precipTotal), rrate: num(m.precipRate), pres: num(m.pressure), sol: num(o.solarRadiation),
      tmax: hi.length ? Math.max(...hi, num(m.temp) ?? -99) : null,
      tmin: lo.length ? Math.min(...lo, num(m.temp) ?? 99) : null,
      fuente: "Estación Meteo Ardoi · meteoardoi.es"
    };
    MEM = { ts: Date.now(), data };
    return Response.json(data, { headers: headers(300) });
  } catch (e) {
    if (MEM.data) return Response.json({ ...MEM.data, aviso: "datos en caché" }, { headers: headers(60) });
    return Response.json({ error: String(e.message || e) }, { status: 502, headers: { ...headers(30), "Netlify-CDN-Cache-Control": "no-store" } });
  }
};
