export default async function () {
    console.log("⏱ Ejecutando cron remoto del backend...");

    const res = await fetch(
        "https://hoopstats-backend-production.up.railway.app/api/cron/run-all",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-cron-key": process.env.CRON_SECRET ?? "",
            },
        }
    );

    console.log("📡 Respuesta:", res.status);
}
