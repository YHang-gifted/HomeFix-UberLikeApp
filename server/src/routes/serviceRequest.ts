import express from 'express';

import {
  getAvailableServiceRequests,
  getServiceRequest,
  getServiceRequestContacts,
  getServiceRequestHistory,
  getServiceRequestMessages,
  getServiceRequests,
  patchServiceRequestAssignment,
  patchServiceRequestClaim,
  patchServiceRequestRelease,
  patchServiceRequestReset,
  patchServiceRequestStatus,
  postServiceRequest,
  postServiceRequestCancel,
  postServiceRequestMessage,
} from '../controllers/serviceRequestController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const serviceRequestRouter = express.Router();

serviceRequestRouter.post('/service-requests', authenticate, postServiceRequest);
serviceRequestRouter.get('/service-requests/available', authenticate, getAvailableServiceRequests);
serviceRequestRouter.get('/service-requests', authenticate, getServiceRequests);
serviceRequestRouter.get('/service-requests/:id/contacts', authenticate, getServiceRequestContacts);
serviceRequestRouter.get('/service-requests/:id/history', authenticate, getServiceRequestHistory);
serviceRequestRouter.get('/service-requests/:id/messages', authenticate, getServiceRequestMessages);
serviceRequestRouter.post(
  '/service-requests/:id/messages',
  authenticate,
  postServiceRequestMessage,
);
serviceRequestRouter.get('/service-requests/:id', authenticate, getServiceRequest);
serviceRequestRouter.patch(
  '/service-requests/:id/assignment',
  authenticate,
  patchServiceRequestAssignment,
);
serviceRequestRouter.patch('/service-requests/:id/claim', authenticate, patchServiceRequestClaim);
serviceRequestRouter.patch(
  '/service-requests/:id/release',
  authenticate,
  patchServiceRequestRelease,
);
serviceRequestRouter.patch('/service-requests/:id/reset', authenticate, patchServiceRequestReset);
serviceRequestRouter.patch('/service-requests/:id/status', authenticate, patchServiceRequestStatus);
serviceRequestRouter.post('/service-requests/:id/cancel', authenticate, postServiceRequestCancel);
