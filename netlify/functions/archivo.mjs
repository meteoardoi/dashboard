import { loadDays } from "../lib/archivo.mjs";

export default async () => {
  try {
    const days = await loadDays();
    const arr = Object.keys(days).sort()
      .filter(k => !days[k].empty)
      .map(k => Object.assign({ date: k }, days[k]));
    return Response.json(arr, { headers: { "Cache-Control": "public, max-age=1800" } });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 500 });
  }
};
