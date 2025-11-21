import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

interface TokenPayload {
    userId: number;
    iat: number;
    exp: number;
}

// Extender Request para poder usar req.user
declare module "express-serve-static-core" {
    interface Request {
        user?: TokenPayload;
    }
}

export const auth = (req: Request, res: Response, next: NextFunction) => {
    try {
        const header = req.headers.authorization;

        if (!header) {
            return res.status(401).json({ error: "Token no proporcionado" });
        }

        // Permite ambos formatos:
        // Authorization: Bearer xxx
        // Authorization: xxx
        const token = header.startsWith("Bearer ")
            ? header.split(" ")[1]
            : header;

        if (!token) {
            return res.status(401).json({ error: "Token no proporcionado" });
        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET as string
        ) as TokenPayload;

        req.user = decoded;

        next();
    } catch (err) {
        console.error("Auth error:", err);
        return res.status(401).json({ error: "Token inválido o expirado" });
    }
};
