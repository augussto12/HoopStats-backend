import { Request, Response, NextFunction } from "express";

export const requireEmailVerified = (req: Request, res: Response, next: NextFunction) => {
    const verified = !!req.user?.email_verified;

    if (!verified) {
        return res.status(403).json({ error: "Debes verificar tu email para usar esta función" });
    }

    return next();
};
