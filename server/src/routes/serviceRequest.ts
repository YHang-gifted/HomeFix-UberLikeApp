import express from 'express';

import { getServiceRequest, postServiceRequest } from '../controllers/serviceRequestController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const serviceRequestRouter = express.Router();

serviceRequestRouter.post('/service-requests', authenticate, postServiceRequest);
serviceRequestRouter.get('/service-requests/:id', authenticate, getServiceRequest);
