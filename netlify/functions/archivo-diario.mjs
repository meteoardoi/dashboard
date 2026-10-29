import { loadDays, saveDays, fetchDay, todayMadrid, addDays } from "../lib/archivo.mjs";

// Cada día a las 02:00 UTC: guarda ayer (y rellena huecos de los últimos 7 días)
export default async () => {
  const days = await loadDays();
  const today = todayMadrid();
  for (let i = 7; i >= 1; i--) {
    const d = addDays(today, -i);
    if (i === 1 || !days[d] || days[d].empty) {
      try { days[d] = await fetchDay(d); } catch (e) { console.log("Error", d, e.message); }
    }
  }
  await saveDays(days);
  console.log("Archivo actualizado hasta", addDays(today, -1));
};

export const config = { schedule: "0 2 * * *" };
