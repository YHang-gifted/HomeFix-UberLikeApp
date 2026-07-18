import express from 'express';

import { getCatalog } from '../controllers/catalogController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const catalogRouter = express.Router();

catalogRouter.get('/catalog', authenticate, getCatalog);
