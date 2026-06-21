const express = require('express');
const router  = express.Router();
const {
  registerUser,
  updateName,
  updateAboutMe,
  getAboutMe,
  getProfileDetails,
  updateProfileDetails,
  getFollowStats,
  getFollowers,
  getFollowing,
  getUserPosts,
  uploadAvatar,
  updateProfilePicture,
  getProfilePicture,
  followUser,
  unfollowUser,
  checkFollowStatus,
  getModerationStatus,
} = require('../controllers/userController.js');

router.post('/register', registerUser);
router.put('/:phone_number/name', updateName);
router.put('/:phone_number/about-me', updateAboutMe);
router.get('/:phone_number/about-me', getAboutMe);
router.get('/:phone_number/profile-details', getProfileDetails);
router.put('/:phone_number/profile-details', updateProfileDetails);

// รูปโปรไฟล์
router.post('/:phone_number/profile-picture', uploadAvatar, updateProfilePicture);
router.get('/:phone_number/profile-picture', getProfilePicture);

// Follow / Unfollow
router.post('/:phone_number/follow',        followUser);
router.post('/:phone_number/unfollow',      unfollowUser);
router.get('/:phone_number/follow-status',  checkFollowStatus);
router.get('/:phone_number/moderation-status', getModerationStatus);

// Stats & Lists
router.get('/:phone_number/follow-stats',   getFollowStats);
router.get('/:phone_number/followers',      getFollowers);
router.get('/:phone_number/following',      getFollowing);

// Posts
router.get('/:phone/posts', getUserPosts);

module.exports = router;
