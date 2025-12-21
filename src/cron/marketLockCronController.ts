import { pool } from "../db";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function getARGDate(d = new Date()) {
  return new Date(
    d.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })
  );
}

function toYYYYMMDD(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const runMarketLockCron = async () => {
  console.log("MarketLockCron START");
  // Pedimos una conexión específica del pool para la transacción
  const client = await pool.connect();

  try {
    const todayARG = toYYYYMMDD(getARGDate());
    console.log("MarketLockCron para día ARG:", todayARG);

    // 1) Buscamos el primer partido (Lógica de fechas intacta)
    const firstGameRes = await client.query(
      `
      SELECT game_id, start_time::text AS start_time_text
      FROM nba_games_daily
      WHERE date_arg = $1
        AND start_time::time >= time '07:00'
      ORDER BY start_time ASC
      LIMIT 1
      `,
      [todayARG]
    );

    let noGamesToday = false;
    let lockStartArg: string;

    if (firstGameRes.rowCount === 0) {
      noGamesToday = true;
      lockStartArg = `${todayARG} 07:00:00`;
      console.log("No hay partidos después de las 07:00, no_games_today = true");
    } else {
      lockStartArg = firstGameRes.rows[0].start_time_text;
      console.log(
        "Primer partido del día (>=07):",
        firstGameRes.rows[0].game_id,
        "start_time ARG (timestamp sin tz):",
        lockStartArg
      );
    }

    // 2) Calculamos lockEnd (Lógica de fechas intacta)
    const lockEndRes = await client.query(
      `
      SELECT ((($1::timestamp)::date + 1) + time '07:00')::timestamp AS lock_end_arg
      `,
      [lockStartArg]
    );

    const lockEndArg: string = lockEndRes.rows[0].lock_end_arg;

    console.log("Guardando market_lock (ARG wall time):", {
      lockStartArg,
      lockEndArg,
      noGamesToday,
    });

    // --- BLOQUE TRANSACCIONAL ---
    // Aquí es donde blindamos la operación
    await client.query("BEGIN");

    // Borrar el registro del día
    await client.query(
      `
      DELETE FROM market_lock
      WHERE (lock_start AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = $1::date
      `,
      [todayARG]
    );

    // Insertar el nuevo bloqueo
    await client.query(
      `
      INSERT INTO market_lock (lock_start, lock_end, no_games_today)
      VALUES (
        ($1::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'),
        ($2::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'),
        $3
      )
      `,
      [lockStartArg, lockEndArg, noGamesToday]
    );

    await client.query("COMMIT");
    // ----------------------------

    console.log("MarketLockCron END OK");
  } catch (err) {
    // Si algo falló, deshacemos el DELETE para que el mercado no quede abierto
    await client.query("ROLLBACK");
    console.error("Error en MarketLockCron:", err);
    throw err;
  } finally {
    // Devolvemos la conexión al pool
    client.release();
  }
};