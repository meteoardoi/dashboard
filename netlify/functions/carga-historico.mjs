import { loadDays, saveDays, fetchDay, rawDay, todayMadrid, addDays } from "../lib/archivo.mjs";

const BUDGET_MS = 6500;  // Netlify corta a los 10 s: paramos antes y guardamos lo hecho
const MAX_DIAS = 8;      // máximo de días por llamada
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const out = (o, s = 200) => Response.json(o, { status: s, headers: { "Cache-Control": "no-store" } });

export default async (req) => {
  const t0 = Date.now();
  const u = new URL(req.url), q = k => u.searchParams.get(k) || "";
  if (!process.env.ADMIN_KEY || q("key") !== process.env.ADMIN_KEY)
    return out({ error: "Clave de administración incorrecta" }, 401);
  if (!process.env.WU_API_KEY || !process.env.WU_STATION_ID)
    return out({ error: "Faltan WU_API_KEY o WU_STATION_ID en las variables de entorno" }, 500);

  try {
    const action = q("action") || "load";

    // ---- Resumen de lo guardado, por año, con el motivo de los errores ----
    if (action === "status") {
      const days = await loadDays(), years = {}, motivos = {}, errDays = [];
      let first = null, last = null;
      for (const d of Object.keys(days).sort()) {
        const v = days[d], y = d.slice(0, 4);
        years[y] ||= { conDatos: 0, vacios: 0, errores: 0 };
        if (v.fail) { years[y].errores++; errDays.push(d); const m = (v.motivo || "desconocido").slice(0, 60); motivos[m] = (motivos[m] || 0) + 1; }
        else if (v.empty) years[y].vacios++;
        else { years[y].conDatos++; first ||= d; last = d; }
      }
      return out({ years, primerDiaConDatos: first, ultimoDiaConDatos: last, total: Object.keys(days).length,
        errores: { total: errDays.length, primero: errDays[0] || null, ultimo: errDays[errDays.length - 1] || null, motivos } });
    }

    // ---- Probar un día directamente contra Weather Underground ----
    if (action === "test") {
      const d = q("date"); if (!ISO.test(d)) return out({ error: "Fecha inválida" }, 400);
      const days = await loadDays();
      try {
        const r = await rawDay(d);
        return out({ date: d, wuStatus: r.status, bytes: r.text.length, respuesta: r.text.slice(0, 400), guardado: days[d] || null });
      } catch (e) { return out({ date: d, error: e.message, guardado: days[d] || null }); }
    }

    // ---- Carga por lotes ----
    const start = q("start"), yesterday = addDays(todayMadrid(), -1);
    let end = q("end") || yesterday; if (end > yesterday) end = yesterday;
    if (!ISO.test(start) || !ISO.test(end) || start > end) return out({ error: "Fechas inválidas" }, 400);
    const retry = q("retry") === "1", force = q("forceErrors") === "1", run = Number(q("run")) || 0;

    // Orden: 1) días nunca pedidos  2) días con error  3) vacíos a reintentar. Cada día, como mucho 1 vez por ejecución.
    const days = await loadDays(), nuevos = [], fallidos = [], vacios = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const v = days[d];
      const yaEnEsta = (v && v.checked || 0) >= run;
      if (!v) nuevos.push(d);
      else if (v.fail && !yaEnEsta && (force || (v.tries || 0) < 3)) fallidos.push(d);
      else if (retry && v.empty && !v.fail && !yaEnEsta) vacios.push(d);
    }
    const pending = nuevos.concat(fallidos, vacios);

    const changes = {}, detalle = [];
    let limit = false, error = null, fatal = null;
    for (const d of pending) {
      if (detalle.length >= MAX_DIAS || Date.now() - t0 > BUDGET_MS) break;
      try {
        const v = await fetchDay(d);
        changes[d] = v;
        detalle.push(v.empty ? `${d} · sin datos (${v.motivo})` : `${d} · OK (máx ${v.tmax} °C, lluvia ${v.rain} mm)`);
      } catch (e) {
        if (e.message === "LIMITE") { limit = true; break; }
        if (e.message === "CLAVE") {
          fatal = "Weather Underground rechaza la clave (HTTP 401/403). Revisa WU_API_KEY y WU_STATION_ID en Netlify y haz un nuevo deploy. No se ha marcado ningún día como erróneo.";
          break;
        }
        const tries = ((days[d] && days[d].tries) || 0) + 1;
        changes[d] = { empty: true, fail: true, tries, motivo: e.message, checked: Date.now() };
        error = `${d}: ${e.message}`;
        detalle.push(`${d} · ERROR (${e.message}) · intento ${tries}, se reintentará`);
      }
    }
    const done = Object.keys(changes).length;
    const saved = done ? await saveDays(changes) : days;
    const remaining = fatal ? pending.length - done : pending.length - done;
    return out({
      done, remaining, limit, error, fatal, detalle,
      withData: Object.values(saved).filter(v => !v.empty).length,
      fallidos: Object.keys(saved).filter(k => saved[k].fail && k >= start && k <= end).length
    });
  } catch (e) {
    return out({ error: "Fallo en la función: " + String(e.message || e) }, 500);
  }
};
