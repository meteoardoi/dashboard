// Utilidades compartidas del archivo histórico (Netlify Blobs)
import { getStore } from "@netlify/blobs";
const store = () => getStore({ name: "meteo", consistency: "strong" });

export async function loadDays() {
  return (await store().get("days", { type: "json" })) || {};
}

// Guarda fusionando con lo que haya en ese momento (evita pisar lo que guarde
// a la vez la función diaria). Los días con datos nunca se sustituyen por "vacío".
export async function saveDays(changes) {
  const cur = await loadDays();
  for (const [d, v] of Object.entries(changes)) {
    if (v && v.empty && cur[d] && !cur[d].empty) continue;
    cur[d] = v;
  }
  await store().setJSON("days", cur);
  return cur;
}

// Fecha de hoy en Madrid (YYYY-MM-DD)
export function todayMadrid() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
}
export function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Llamada "en bruto" a WU para un día (también la usa el diagnóstico)
export async function rawDay(iso, ms = 7000) {
  const p = new URLSearchParams({
    stationId: process.env.WU_STATION_ID, format: "json", units: "m",
    numericPrecision: "decimal", date: iso.replace(/-/g, ""), apiKey: process.env.WU_API_KEY
  });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch("https://api.weather.com/v2/pws/history/daily?" + p.toString(), { signal: ctrl.signal });
    return { status: r.status, text: await r.text() };
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "TIMEOUT" : String(e.message || e));
  } finally { clearTimeout(t); }
}

// Descarga el resumen de un día. Devuelve los datos o {empty:true, motivo, checked}.
// Lanza error si es un fallo temporal (límite, timeout, HTTP 5xx...) para reintentarlo.
export async function fetchDay(iso) {
  const { status, text } = await rawDay(iso);
  if (status === 429) throw new Error("LIMITE");
  if (status === 204 || (status === 200 && !text)) return { empty: true, motivo: "WU sin datos (" + status + ")", checked: Date.now() };
  if (status !== 200) throw new Error("HTTP " + status + " " + text.slice(0, 120));
  let j; try { j = JSON.parse(text); } catch { throw new Error("Respuesta no JSON de WU"); }
  const obs = (j.observations || [])[0];
  if (!obs || !obs.metric) return { empty: true, motivo: "sin observaciones", checked: Date.now() };
  const m = obs.metric;
  return {
    tmax: m.tempHigh, tmin: m.tempLow, tavg: m.tempAvg,
    hmax: obs.humidityHigh, hmin: obs.humidityLow, havg: obs.humidityAvg,
    gust: m.windgustHigh, wavg: m.windspeedAvg, rain: m.precipTotal
  };
}
