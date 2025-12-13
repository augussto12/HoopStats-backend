import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export function requireCronKey(req: Request, res: Response, next: NextFunction) {
    const cronKeyHeader = req.headers["x-cron-key"];
    const secret = process.env.CRON_SECRET || "";

    if (!cronKeyHeader || typeof cronKeyHeader !== "string" || !secret) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const headerBuf = Buffer.from(cronKeyHeader);
    const secretBuf = Buffer.from(secret);

    const ok =
        headerBuf.length === secretBuf.length &&
        crypto.timingSafeEqual(headerBuf, secretBuf);

    if (!ok) return res.status(401).json({ error: "Unauthorized" });

    return next();
}
