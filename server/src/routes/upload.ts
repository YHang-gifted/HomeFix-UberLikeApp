import express from 'express';

import { getUploadFile, postUpload, putUploadFile } from '../controllers/uploadController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const uploadRouter = express.Router();

// The image types the mock upload provider accepts, and a 5 MB cap.
const rawImage = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' });

uploadRouter.post('/uploads', authenticate, postUpload);
uploadRouter.put('/uploads/:id', authenticate, rawImage, putUploadFile);
// Public read so an uploaded image can be rendered directly in the app.
uploadRouter.get('/uploads/:id', getUploadFile);
