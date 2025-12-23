import { Request, Response } from 'express';
import { pool } from '../db';

export const getInjuryReport = async (req: Request, res: Response) => {
    try {
        // Consultamos la tabla que llena el Cron
        const result = await pool.query('SELECT * FROM nba_injuries ORDER BY team_name ASC, player_name ASC');

        if (result.rows.length === 0) {
            return res.json({ success: true, timestamp: new Date().toISOString(), data: [], message: "No hay datos disponibles" });
        }

        const grouped = result.rows.reduce((acc: any[], row: any) => {
            let team = acc.find(t => t.team === row.team_name);
            if (!team) {
                team = { team: row.team_name, players: [] };
                acc.push(team);
            }
            team.players.push({
                name: row.player_name,
                position: row.position,
                status: row.status,
                statusType: row.status_type,
                updated: row.updated_at_source,
                reason: row.reason
            });
            return acc;
        }, []);

        res.json({
            success: true,
            // Usamos la fecha de la DB si quieres ser más preciso, o la actual
            timestamp: new Date().toISOString(),
            data: grouped
        });
    } catch (error: any) {
        console.error("Error al obtener reporte de DB:", error);
        res.status(500).json({ success: false, error: "Error al cargar datos de lesiones" });
    }
};