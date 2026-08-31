import type { NextFunction, Request, Response } from "express";
import { optionalAuthUserId } from "./authMiddleware.js";
import { resolveAuthUser } from "./founderAuth.js";
import type { User } from "@supabase/supabase-js";

export type AuthedRequest = Request & { authUserId?: string; authUser?: User };

export function getAuthUserId(req: Request): string | undefined {
  return (req as AuthedRequest).authUserId;
}

export function requireAuthUser(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const user = await resolveAuthUser(req);
    if (!user) {
      res.status(401).json({ error: "Sign in required" });
      return;
    }
    const authed = req as AuthedRequest;
    authed.authUserId = user.id;
    authed.authUser = user;
    next();
  })().catch(next);
}

export async function optionalUserId(req: Request): Promise<string | null> {
  return optionalAuthUserId(req);
}
