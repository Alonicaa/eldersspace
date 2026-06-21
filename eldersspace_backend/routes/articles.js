const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/articleController');

// Public (approved articles only)
router.get('/',                       ctrl.getApprovedArticles);
router.get('/ranking',                ctrl.getArticleRanking);
router.get('/my/:phone',              ctrl.getMyArticles);
router.get('/user/:userId',           ctrl.getArticlesByUser);
router.post('/submit',                ctrl.upload, ctrl.submitUserArticle);
router.get('/:id',                    ctrl.getArticleById);

// Interactions
router.post('/:id/view',              ctrl.viewArticle);
router.post('/:id/like',              ctrl.likeArticle);
router.post('/:id/share',             ctrl.shareArticle);
router.get('/:id/comments',           ctrl.getArticleComments);
router.post('/:id/comments',          ctrl.addArticleComment);
router.delete('/:id/comments/:cid',   ctrl.deleteArticleComment);

module.exports = router;
