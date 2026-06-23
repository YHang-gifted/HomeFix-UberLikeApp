import express from 'express';

import { getAuditEvents } from '../controllers/auditController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const auditRouter = express.Router();

auditRouter.get('/audit', authenticate, getAuditEvents);
