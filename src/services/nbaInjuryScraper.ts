import axios from 'axios';
import * as cheerio from 'cheerio';
import { pool } from '../db'; // Importa tu conexión a la DB

const ZENROWS_API_KEY = 'dbbad44f4743e2716b050e6c9fe008a8f7e4ad10';
const SCRAPEDO_TOKEN = '68c5c531b8d34e2699281033f8ca2e5019b78c07a9f';
const NBA_URL = 'https://www.cbssports.com/nba/injuries/';


export interface ScrapedInjury {
    name: string;
    position: string;
    status: string;
    statusType?: string; // Para clases CSS (out, questionable, etc)
    updated: string;
    reason: string;
}

export interface ScrapedTeamGroup {
    team: string;
    players: ScrapedInjury[];
}

// Helper para traducción manual robusta (evita límites de API de Google)
const translationMap: { [key: string]: string } = {
    // Estados
    'expected to be out until at least': 'Se espera que esté fuera hasta al menos el',
    'game time decision': 'Decisión a la hora del partido',
    'out for the season': 'Fuera por el resto de la temporada',
    'out': 'Fuera',
    'questionable': 'Cuestionable',
    'probable': 'Probable',
    'doubtful': 'Dudoso',
    'expected to be out': 'Se espera que esté fuera',

    // Partes del cuerpo / Razones
    'ankle': 'Tobillo',
    'knee': 'Rodilla',
    'foot': 'Pie',
    'shoulder': 'Hombro',
    'hip': 'Cadera',
    'back': 'Espalda',
    'wrist': 'Muñeca',
    'hand': 'Mano',
    'finger': 'Dedo',
    'thumb': 'Pulgar',
    'calf': 'Pantorrilla',
    'thigh': 'Muslo',
    'groin': 'Ingle',
    'heel': 'Talón',
    'illness': 'Enfermedad',
    'rest': 'Descanso',
    'concussion': 'Conmoción cerebral',
    'hamstring': 'Isquiotibiales',
    'achilles': 'Aquiles',
    'elbow': 'Codo',
    'neck': 'Cuello',
    'rib': 'Costilla',
    'toe': 'Dedo del pie',
    'abdomen': 'Abdomen',
    'chest': 'Pecho',

    // Meses
    'jan': 'Ene', 'feb': 'Feb', 'mar': 'Mar', 'apr': 'Abr', 'may': 'May', 'jun': 'Jun',
    'jul': 'Jul', 'aug': 'Ago', 'sep': 'Sep', 'oct': 'Oct', 'nov': 'Nov', 'dec': 'Dic',

    // Días
    'mon': 'Lun', 'tue': 'Mar', 'wed': 'Mié', 'thu': 'Jue', 'fri': 'Vie', 'sat': 'Sáb', 'sun': 'Dom'
};

const translateText = (text: string): string => {
    if (!text) return text;
    let translated = text; // Keep original case for initial replacements

    // Reemplazo de frases completas primero (insensible a mayúsculas)
    Object.entries(translationMap).forEach(([key, value]) => {
        const regex = new RegExp(`\\b${key}\\b`, 'gi'); // Use word boundaries for more accurate replacement
        translated = translated.replace(regex, value);
    });

    // Ajuste de formato de fecha "Dic 28" -> "28 de Dic"
    // This regex needs to match the translated month abbreviations
    translated = translated.replace(/(Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Oct|Nov|Dic)\s+(\d+)/gi, '$2 de $1');

    // Capitalizar la primera letra del resultado final
    return translated.charAt(0).toUpperCase() + translated.slice(1);
};

export const fetchInjuryReport = async (): Promise<ScrapedTeamGroup[]> => {
    try {
        let htmlContent: string;

        // --- OPCIÓN A: ZENROWS (ACTUAL) ---
        // console.log("1. Conectando a ZenRows (CBS Sports)...");
        // const response = await axios({
        //     url: 'https://api.zenrows.com/v1/',
        //     method: 'GET',
        //     timeout: 30000,
        //     params: {
        //         'url': NBA_URL,
        //         'apikey': ZENROWS_API_KEY,
        //         'js_render': 'true',
        //         'json_response': 'true',
        //         'premium_proxy': 'true'
        //     },
        // });
        // htmlContent = response.data.html || response.data.content || (typeof response.data === 'string' ? response.data : null);

        // --- OPCIÓN B: SCRAPE.DO (ALTERNATIVA POR SI SE ACABAN LOS CRÉDITOS) ---
        // Para usar esta, comenta el bloque de ZenRows arriba y descomenta este:

        console.log("1. Conectando a Scrape.do (Alternativa)...");
        const targetUrl = encodeURIComponent(NBA_URL);
        const response = await axios.get(`http://api.scrape.do/?url=${targetUrl}&token=${SCRAPEDO_TOKEN}`);
        htmlContent = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);


        if (!htmlContent) {
            throw new Error("No se recibió contenido HTML del proveedor de scraping");
        }

        const $ = cheerio.load(htmlContent);
        const groups: ScrapedTeamGroup[] = [];

        $('div.TableBase').each((_i, el) => {
            const teamName = $(el).find('.TeamLogoNameLockup-name a').text().trim() ||
                $(el).find('.TeamLogoNameLockup-name').text().trim();

            if (!teamName) return;

            const players: ScrapedInjury[] = [];

            $(el).find('tr.TableBase-bodyTr').each((_j, tr) => {
                const name = $(tr).find('td:nth-child(1) .CellPlayerName--long a').text().trim() ||
                    $(tr).find('td:nth-child(1)').text().trim();
                const position = $(tr).find('td:nth-child(2)').text().trim();
                const updated = $(tr).find('td:nth-child(3)').text().trim();
                const injuryPart = $(tr).find('td:nth-child(4)').text().trim();
                const status = $(tr).find('td:nth-child(5)').text().trim();

                if (name) {
                    let statusType = 'questionable';
                    let categoricalStatus = 'Cuestionable';

                    const lowerStatus = status.toLowerCase();
                    if (lowerStatus.includes('out')) {
                        statusType = 'out';
                        categoricalStatus = 'Fuera';
                    } else if (lowerStatus.includes('questionable')) {
                        statusType = 'questionable';
                        categoricalStatus = 'Cuestionable';
                    } else if (lowerStatus.includes('probable')) {
                        statusType = 'probable';
                        categoricalStatus = 'Probable';
                    } else if (lowerStatus.includes('doubtful')) {
                        statusType = 'doubtful';
                        categoricalStatus = 'Dudoso';
                    } else if (lowerStatus.includes('decision') || lowerStatus.includes('gtd')) {
                        statusType = 'questionable';
                        categoricalStatus = 'Cuestionable';
                    }

                    players.push({
                        name,
                        position,
                        updated: translateText(updated),
                        status: categoricalStatus,
                        statusType: statusType,
                        reason: translateText(`${injuryPart}: ${status}`)
                    });
                }
            });

            groups.push({ team: teamName, players });
        });

        console.log(`2. Scrapeados y traducidos ${groups.length} equipos.`);
        return groups;

    } catch (error: any) {
        console.error("Scraper Error:", error.message);
        throw error;
    }
};


export const saveInjuriesToDB = async (groups: ScrapedTeamGroup[]) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // 1. Limpiamos la tabla anterior
        await client.query('DELETE FROM nba_injuries');

        // 2. Insertamos los nuevos datos
        for (const group of groups) {
            for (const p of group.players) {
                await client.query(
                    `INSERT INTO nba_injuries 
                    (team_name, player_name, position, status, status_type, updated_at_source, reason) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [group.team, p.name, p.position, p.status, p.statusType, p.updated, p.reason]
                );
            }
        }
        await client.query('COMMIT');
        console.log("✅ DB: Reporte de lesiones actualizado.");
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
};