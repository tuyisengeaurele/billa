import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

declare global {
  namespace Express {
    interface Request {
      listQuery?: unknown;
    }
  }
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({ error: "invalid_query", details: result.error.flatten() });
      return;
    }
    req.listQuery = result.data;
    next();
  };
}
