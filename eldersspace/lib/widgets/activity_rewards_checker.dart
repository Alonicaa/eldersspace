import 'dart:async';
import 'package:flutter/material.dart';
import '../services/reward_service.dart';

/// Activity Rewards Widget - ตรวจสอบและแสดงรางวัลจากกิจกรรม
/// - Profile Completion: +50
/// - Post Activity: +10
/// - Comment Activity: +2 per comment (max 5/day)
class ActivityRewardsChecker extends StatefulWidget {
  final String phoneNumber;
  final VoidCallback onRewardEarned;

  const ActivityRewardsChecker({
    super.key,
    required this.phoneNumber,
    required this.onRewardEarned,
  });

  @override
  State<ActivityRewardsChecker> createState() => _ActivityRewardsCheckerState();
}

class _ActivityRewardsCheckerState extends State<ActivityRewardsChecker> {
  Timer? _activityCheckTimer;

  @override
  void initState() {
    super.initState();
    _startActivityRewardChecks();
  }

  @override
  void dispose() {
    _activityCheckTimer?.cancel();
    super.dispose();
  }

  void _startActivityRewardChecks() {
    _activityCheckTimer?.cancel();
    // ตรวจสอบทุก 10 นาที
    _activityCheckTimer = Timer.periodic(
      const Duration(minutes: 10),
      (_) => _checkActivityRewards(),
    );
    // ตรวจสอบครั้งแรกหลังจาก 30 วินาที
    Future.delayed(const Duration(seconds: 30), _checkActivityRewards);
  }

  Future<void> _checkActivityRewards() async {
    final points = await _checkAllActivityRewards();
    if (points > 0 && mounted) {
      widget.onRewardEarned();
    }
  }

  Future<int> _checkAllActivityRewards() async {
    int totalPoints = 0;

    // 1. Profile Completion
    final profileResult = await RewardService.checkProfileCompletion(
      widget.phoneNumber,
    );
    if (profileResult['success'] == true) {
      final points = (profileResult['points_awarded'] as num?)?.toInt() ?? 0;
      totalPoints += points;
      if (mounted) {
        _showRewardSnackbar(
          profileResult['message'] ?? 'ได้รับแต้ม +$points',
          Icons.check_circle,
          Colors.green,
        );
      }
    }

    // 2. Post Activity
    final postResult = await RewardService.checkPostActivity(
      widget.phoneNumber,
    );
    if (postResult['success'] == true) {
      final points = (postResult['points_awarded'] as num?)?.toInt() ?? 0;
      totalPoints += points;
      if (mounted) {
        _showRewardSnackbar(
          postResult['message'] ?? 'ได้รับแต้ม +$points',
          Icons.article,
          Colors.blue,
        );
      }
    }

    // 3. Comment Activity
    final commentResult = await RewardService.checkCommentActivity(
      widget.phoneNumber,
    );
    if (commentResult['success'] == true) {
      final points = (commentResult['points_awarded'] as num?)?.toInt() ?? 0;
      totalPoints += points;
      if (mounted) {
        _showRewardSnackbar(
          commentResult['message'] ?? 'ได้รับแต้ม +$points',
          Icons.comment,
          Colors.orange,
        );
      }
    }

    return totalPoints;
  }

  void _showRewardSnackbar(String message, IconData icon, Color color) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(icon, color: Colors.white),
            SizedBox(width: 12),
            Expanded(child: Text(message)),
          ],
        ),
        backgroundColor: color,
        duration: const Duration(seconds: 4),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // This widget doesn't render anything, it just monitors in background
    return const SizedBox.shrink();
  }
}
