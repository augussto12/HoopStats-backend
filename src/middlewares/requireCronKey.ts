import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export function requireCronKey(req: Request, res: Response, next: NextFunction) {
    const cronKeyHeader = req.headers["x-cron-key"];
    const secret = process.env.CRON_SECRET;

    if (!cronKeyHeader || !secret || typeof cronKeyHeader !== "string") {
        return res.status(401).json({ error: "Unauthorized" });
    }

    // Aseguramos que tengan la misma longitud antes de comparar
    // para evitar que timingSafeEqual lance un error.
    const keyBuf = Buffer.from(cronKeyHeader);
    const secretBuf = Buffer.from(secret);

    if (keyBuf.length !== secretBuf.length) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    if (crypto.timingSafeEqual(keyBuf, secretBuf)) {
        return next();
    }

    return res.status(401).json({ error: "Unauthorized" });
}
