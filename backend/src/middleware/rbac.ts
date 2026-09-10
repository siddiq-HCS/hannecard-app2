import type { Request, Response, NextFunction } from 'express';
import type { Permission, Role } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

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

/**
 * فحص الصلاحية:
 * - المطور (DEVELOPER) يمر دائماً (صلاحيات كاملة).
 * - المندوب يُفحص ضد جدول user_permissions الممنوح من الإدارة.
 * - المدير بدون صلاحيات محددة يمر دائماً (صلاحيات كاملة).
 * - المدير الذي مُنحت له صلاحيات محددة (عبر شاشة إدارة المدراء) يُقيَّد بها فقط.
 */
export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });

    // المطور له صلاحيات كاملة دائماً
    if (req.user.role === 'DEVELOPER') return next();

    const granted = await prisma.userPermission.findUnique({
      where: { userId_permission: { userId: req.user.id, permission } },
    });
    if (granted) return next();

    // مصفوفة الصلاحيات المحددة للدور (RolePermission):
    // دور مُهيأ → تُحسم الصفحات من قائمة دوره فقط، ودور غير مُهيأ → السلوك الافتراضي أدناه.
    const roleRows = await prisma.rolePermission.findMany({
      where: { role: req.user.role },
      select: { permission: true },
    });
    if (roleRows.length > 0) {
      if (roleRows.some((r) => r.permission === permission)) return next();
      return res.status(403).json({ error: 'forbidden' });
    }

    if (MANAGER_ROLES.includes(req.user.role)) {
      // المديرون: إن لم تُحدد لهم أي صلاحيات فلديهم كل الصلاحيات.
      const any = await prisma.userPermission.findFirst({ where: { userId: req.user.id } });
      if (!any) return next();
    }

    return res.status(403).json({ error: 'forbidden' });
  };
}

/**
 * فحص صلاحية الوصول لصفحة/قائمة إدارية:
 * - المطور (DEVELOPER) يمر دائماً.
 * - المندوب (REPRESENTATIVE) يمر دائماً (الموبايل لا يُقيَّد بصلاحيات الصفحات).
 * - المدير بدون صلاحيات محددة يمر دائماً (صلاحيات كاملة).
 * - المدير ذو الصلاحيات المحددة يُقيَّد بالصفحات الممنوحة له فقط.
 */
export function requirePageAccess(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (req.user.role === 'DEVELOPER' || req.user.role === 'REPRESENTATIVE') return next();
    return requirePermission(permission)(req, res, next);
  };
}

/**
 * فحص هل المستخدم مطور (Developer) فقط
 */
export function requireDeveloper() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (req.user.role !== 'DEVELOPER') {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}
