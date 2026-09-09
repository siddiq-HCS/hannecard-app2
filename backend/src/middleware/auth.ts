import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user: {
        id: string;
        role: Role;
        name: string;
        isActive: boolean;
      };
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing_token' });
  }

  try {
    const payload = verifyToken(header.slice(7));
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'invalid_token' });
    }
    req.user = { id: user.id, role: user.role, name: user.name, isActive: user.isActive };
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}
