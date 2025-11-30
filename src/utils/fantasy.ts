import { pool } from "../db";

export function calcFantasyPoints(s: any): number {

    // ----------------------------
    // 1) Cálculo base
    // ----------------------------
    let points =
        (s.points ?? 0) * 1.0 +
        (s.totReb ?? 0) * 1.25 +
        (s.assists ?? 0) * 1.5 +
        (s.steals ?? 0) * 3 +
        (s.blocks ?? 0) * 3 +
        (s.turnovers ?? 0) * -1 +
        (s.fgm ?? 0) * 1 +
        ((s.fga ?? 0) - (s.fgm ?? 0)) * -0.5 +
        (s.ftm ?? 0) * 0.5 +
        ((s.fta ?? 0) - (s.ftm ?? 0)) * -0.25 +
        (s.tpm ?? 0) * 0.5 +
        (s.plusMinus ? Number(s.plusMinus) * 0.1 : 0);

    // ----------------------------
    // 2) Double/Triple Double
    // ----------------------------
    const categories = [
        s.points ?? 0,
        s.totReb ?? 0,
        s.assists ?? 0,
        s.steals ?? 0,
        s.blocks ?? 0
    ];

    const count10s = categories.filter(v => v >= 10).length;

    if (count10s >= 3) {
        // Triple double
        points += 8;
    } else if (count10s >= 2) {
        // Double double
        points += 5;
    }

    return Number(points.toFixed(2));
}



// Chequear si jugó más de 1 minuto
export function playedMoreThanOneMinute(s: any): boolean {
    return typeof s.min === "number" && s.min >= 2;
}


export async function getStatusId(scope: string, code: string) {
    const res = await pool.query(
        `SELECT id FROM hoopstats.fantasy_league_statuses
         WHERE scope = $1 AND code = $2`,
        [scope, code]
    );
    return res.rows[0]?.id;
}

export async function getUsername(userId: number) {
    const res = await pool.query(`SELECT username FROM hoopstats.users WHERE id = $1`, [userId]);
    return res.rows.length ? res.rows[0].username : null;
}
