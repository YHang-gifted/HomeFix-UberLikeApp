import express from 'express';

import {
  getAdminCertifications,
  getMyCertifications,
  postCertification,
  postCertificationReview,
} from '../controllers/certificationController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const certificationRouter = express.Router();

certificationRouter.get('/certifications', authenticate, getMyCertifications);
certificationRouter.post('/certifications', authenticate, postCertification);
// Admin review queue + decision.
certificationRouter.get('/admin/certifications', authenticate, getAdminCertifications);
certificationRouter.post('/certifications/:id/review', authenticate, postCertificationReview);
