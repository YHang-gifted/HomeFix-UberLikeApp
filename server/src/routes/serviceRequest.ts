import express from 'express';

import {
  getServiceRequest,
  patchServiceRequestStatus,
  postServiceRequest,
} from '../controllers/serviceRequestController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const serviceRequestRouter = express.Router();

serviceRequestRouter.post('/service-requests', authenticate, postServiceRequest);
serviceRequestRouter.get('/service-requests/:id', authenticate, getServiceRequest);
serviceRequestRouter.patch('/service-requests/:id/status', authenticate, patchServiceRequestStatus);
