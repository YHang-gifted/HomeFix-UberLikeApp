import express from 'express';

import { getMyCertifications, postCertification } from '../controllers/certificationController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const certificationRouter = express.Router();

certificationRouter.get('/certifications', authenticate, getMyCertifications);
certificationRouter.post('/certifications', authenticate, postCertification);
