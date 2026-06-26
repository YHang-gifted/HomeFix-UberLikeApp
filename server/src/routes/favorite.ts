import express from 'express';

import { deleteFavorite, getFavorites, putFavorite } from '../controllers/favoriteController.ts';
import { authenticate } from '../middlewares/auth.ts';

export const favoriteRouter = express.Router();

favoriteRouter.get('/favorites', authenticate, getFavorites);
favoriteRouter.put('/favorites/:workerId', authenticate, putFavorite);
favoriteRouter.delete('/favorites/:workerId', authenticate, deleteFavorite);
