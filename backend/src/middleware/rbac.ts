import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@prisma/client';

/** أدوار الإدارة (تتجاوز كل بوابات الصلاحيات في التطبيق) */
const MANAGER_ROLES: Role[] = ['SALES_MANAGER', 'DEPUTY_SALES_MANAGER', 'DEVELOPER'];

/** السماح بأدوار محددة فقط (وأدوار الإدارة دائماً) */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (roles.includes(req.user.role) || MANAGER_ROLES.includes(req.user.role)) {
      next();
      return;
    }
    return res.status(403).json({ error: 'forbidden' });
  };
}
