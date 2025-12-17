import { pool } from "../db";

// export function calcFantasyPoints(s: any): number {

//     // ----------------------------
//     // 1) Cálculo base
//     // ----------------------------
//     let points =
//         (s.points ?? 0) * 1.0 +
//         (s.totReb ?? 0) * 1.25 +
//         (s.assists ?? 0) * 1.5 +
//         (s.steals ?? 0) * 3 +
//         (s.blocks ?? 0) * 3 +
//         (s.turnovers ?? 0) * -1 +
//         (s.fgm ?? 0) * 1 +
//         ((s.fga ?? 0) - (s.fgm ?? 0)) * -0.5 +
//         (s.ftm ?? 0) * 0.5 +
//         ((s.fta ?? 0) - (s.ftm ?? 0)) * -0.25 +
//         (s.tpm ?? 0) * 0.5 +
//         (s.plusMinus ? Number(s.plusMinus) * 0.1 : 0);

//     // ----------------------------
//     // 2) Double/Triple Double
//     // ----------------------------
//     const categories = [
//         s.points ?? 0,
//         s.totReb ?? 0,
//         s.assists ?? 0,
//         s.steals ?? 0,
//         s.blocks ?? 0
//     ];

//     const count10s = categories.filter(v => v >= 10).length;

//     if (count10s >= 3) {
//         // Triple double
//         points += 8;
//     } else if (count10s >= 2) {
//         // Double double
//         points += 5;
//     }

//     return Number(points.toFixed(2));
// }


export function calcFantasyPoints(s: any): number {
    const n = (v: any) => (v == null || v === "" ? 0 : Number(v));

    const minutes = typeof s.min === "string" ? parseInt(s.min, 10) : n(s.min);

    const pm =
        typeof s.plusMinus === "string"
            ? Number(s.plusMinus.replace("+", ""))
            : n(s.plusMinus);

    const points = n(s.points);
    const totReb = n(s.totReb);
    const offReb = n(s.offReb);
    const assists = n(s.assists);
    const steals = n(s.steals);
    const blocks = n(s.blocks);
    const turnovers = n(s.turnovers);
    const pFouls = n(s.pFouls);

    const fga = n(s.fga);
    const fgm = n(s.fgm);
    const fta = n(s.fta);
    const ftm = n(s.ftm);
    const tpa = n(s.tpa);
    const tpm = n(s.tpm);

    const missedFG = Math.max(0, fga - fgm);
    const missedFT = Math.max(0, fta - ftm);
    const missed3P = Math.max(0, tpa - tpm);

    let fp =
        points * 1.0 +
        totReb * 1.2 +
        offReb * 0.3 +
        assists * 1.5 +
        steals * 3.0 +
        blocks * 3.0 +
        turnovers * -1.0 +
        missedFG * -0.4 +
        missedFT * -0.2 +
        tpm * 0.5 +
        missed3P * -0.15 +
        pm * 0.1 +
        pFouls * -0.25;

    // Foul-out penalty (pro)
    if (pFouls >= 6) fp += -1.5;

    // Double/Triple Double
    const cats = [points, totReb, assists, steals, blocks];
    const count10 = cats.filter(v => v >= 10).length;
    if (count10 >= 3) fp += 8;
    else if (count10 >= 2) fp += 5;

    // regla min
    if (!Number.isFinite(minutes) || minutes < 2) return 0;

    return Number(fp.toFixed(2));
}



// Chequear si jugó más de 1 minuto
export function playedMoreThanOneMinute(s: any): boolean {
    const minutes = typeof s.min === "string"
        ? parseInt(s.min, 10)
        : Number(s.min);

    return Number.isFinite(minutes) && minutes >= 2;
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
