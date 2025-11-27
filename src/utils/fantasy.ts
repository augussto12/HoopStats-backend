import { pool } from "../db";

export function calcFantasyPoints(s: any): number {
    return (
        (s.points ?? 0) * 1 +
        (s.totReb ?? 0) * 1.2 +
        (s.assists ?? 0) * 1.5 +
        (s.blocks ?? 0) * 3 +
        (s.steals ?? 0) * 3 +
        (s.turnovers ?? 0) * -2
    );
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
