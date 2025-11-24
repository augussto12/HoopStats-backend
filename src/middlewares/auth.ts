import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

interface TokenPayload {
    userId: number;
    iat: number;
    exp: number;
}

// Extender Request para req.user
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

        // Soporta: "Bearer xxx" o "xxx"
        const token = header.startsWith("Bearer ")
            ? header.slice(7)
            : header;

        if (!token) {
            return res.status(401).json({ error: "Token no proporcionado" });
        }

        // Verificar token
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET as string
        ) as TokenPayload;

        req.user = decoded;

        next();

    } catch (err: any) {

        // Token expirado
        if (err.name === "TokenExpiredError") {
            return res.status(401).json({ error: "Token expirado" });
        }

        // Token manipulado
        if (err.name === "JsonWebTokenError") {
            return res.status(401).json({ error: "Token inválido" });
        }

        console.error("Auth error:", err);
        return res.status(401).json({ error: "Error de autenticación" });
    }
};
