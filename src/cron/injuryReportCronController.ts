// src/cron/injuryCronController.ts (Ejemplo de ubicación)
import { fetchInjuryReport } from "../services/nbaInjuryScraper";
import { saveInjuriesToDB } from "../services/nbaInjuryScraper";

export const runInjuryScrapingCron = async () => {
    try {
        console.log("[CRON-INJURIES] Iniciando actualización programada...");
        const data = await fetchInjuryReport();
        await saveInjuriesToDB(data);
        console.log("[CRON-INJURIES] Actualización completada con éxito.");
    } catch (err) {
        console.error("[CRON-INJURIES] Error durante el proceso:", err);
    }
};