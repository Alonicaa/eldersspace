const express = require("express");
const router = express.Router();

const { getNotifications, createRewardNotification } = require("../controllers/notificationController");

router.get("/:phone", getNotifications);
router.post("/reward", createRewardNotification);

module.exports = router;