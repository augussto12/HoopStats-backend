import { ZodSchema } from "zod";

export const validate =
    (schema: ZodSchema) =>
        (req: any, res: any, next: any) => {
            try {
                req.body = schema.parse(req.body);
                next();
            } catch (err: any) {
                return res.status(400).json({
                    error: err?.errors?.[0]?.message || "Datos inválidos",
                });
            }
        };