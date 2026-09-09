import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { captureLocation } from '../middleware/location.js';

const router = Router();

// تسجيل موقع عام عند أي حركة (يستخدمه التطبيق مع كل إجراء)
router.post(
  '/',
  authenticate,
  requirePermission('LOCATION_SEND'),
  captureLocation('GENERIC_ACTION'),
  (_req, res) => {
    res.json({ ok: true });
  },
);

export const locationsRouter = router;
