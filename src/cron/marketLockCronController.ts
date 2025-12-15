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

  try {
    const todayARG = toYYYYMMDD(getARGDate());
    console.log("MarketLockCron para día ARG:", todayARG);

    // Traemos el primer partido cuyo start_time (HORA ARG) sea >= 07:00
    // start_time es timestamp sin tz, lo interpretamos como "hora Argentina".
    const firstGameRes = await pool.query(
      `
      SELECT game_id, start_time::text AS start_time_text
      FROM hoopstats.nba_games_daily
      WHERE date_arg = $1
        AND start_time::time >= time '07:00'
      ORDER BY start_time ASC
      LIMIT 1
      `,
      [todayARG]
    );

    let noGamesToday = false;

    // Estos son "wall time" ARG (timestamp sin tz, en texto)
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

    // lockEnd: día siguiente a las 07:00 ARG (calculado sin depender del timezone del server)
    const lockEndRes = await pool.query(
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

    // borrar el registro del día (comparando fecha en ARG)
    await pool.query(
      `
      DELETE FROM hoopstats.market_lock
      WHERE (lock_start AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = $1::date
      `,
      [todayARG]
    );

    // INSERT: convertir esos timestamps "ARG" a timestamptz correctamente
    await pool.query(
      `
      INSERT INTO hoopstats.market_lock (lock_start, lock_end, no_games_today)
      VALUES (
        ($1::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'),
        ($2::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'),
        $3
      )
      `,
      [lockStartArg, lockEndArg, noGamesToday]
    );

    console.log("MarketLockCron END OK");
  } catch (err) {
    console.error("Error en MarketLockCron:", err);
    throw err;
  }
};
