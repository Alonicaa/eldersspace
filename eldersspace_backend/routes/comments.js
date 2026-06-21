const express = require('express');
const router = express.Router();

const {
 getComments,
 addComment,
 updateComment,
 deleteComment,
 reportComment,
} = require('../controllers/commentController');

router.get('/:postId',getComments);

router.post('/:postId',addComment);

router.put('/item/:commentId',updateComment);

router.delete('/item/:commentId',deleteComment);

router.post('/item/:commentId/report', reportComment);

module.exports = router;