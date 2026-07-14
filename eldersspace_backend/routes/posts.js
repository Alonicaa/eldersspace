const express = require("express");
const router = express.Router();

const postController = require("../controllers/postController");

router.get("/", postController.getPosts);
router.get("/:id", postController.getPostById);
router.post("/", postController.upload, postController.createPost);
router.delete("/:id", postController.deletePost);
router.post("/:id/like", postController.likePost);
router.post("/:id/hide", postController.hidePost);
router.post("/:id/report", postController.reportPost);
router.put("/:id", postController.upload, postController.updatePost);

module.exports = router;