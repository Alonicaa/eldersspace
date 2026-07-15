import 'package:flutter/material.dart';

class SessionBanner extends StatelessWidget {
  final num sessionElapsedMinutes;
  final num minutesToNextPoint;
  final num sessionBonusThreshold; // ค่า threshold สำหรับคำนวณ progress
  final num pointsPerReward;
  final num dailyAwardedPoints;
  final num maxDailyPoints;
  final num dailyLimitCount;
  final VoidCallback? onClose;

  const SessionBanner({
    super.key,
    required this.sessionElapsedMinutes,
    required this.minutesToNextPoint,
    this.sessionBonusThreshold = 120,
    this.pointsPerReward = 1,
    this.dailyAwardedPoints = 0,
    this.maxDailyPoints = 0,
    this.dailyLimitCount = 0,
    this.onClose,
  });

  @override
  Widget build(BuildContext context) {
    final elapsed = sessionElapsedMinutes.toInt();
    final minutesLeft = minutesToNextPoint.toInt();
    final elapsedHr = elapsed ~/ 60;
    final elapsedMin = elapsed % 60;
    final threshold = sessionBonusThreshold.toInt();
    final dailyPoints = dailyAwardedPoints.toInt();
    final dailyMax = maxDailyPoints.toInt();
    final rewardPoints = pointsPerReward.toInt();
    final dailyLimitReached = dailyMax > 0 && dailyPoints >= dailyMax;
    // Cap display so it never shows more than max (e.g. 16/8 when settings changed)
    final displayPoints = dailyMax > 0 ? dailyPoints.clamp(0, dailyMax) : dailyPoints;
    // Progress must be derived from the same "minutes left" the backend
    // already computed (minutesLeft), not recomputed from `elapsed` here —
    // elapsed is today's *total* usage across all sessions, while the
    // reward cycle countdown is a separate figure, so mixing the two
    // produced a progress bar that didn't match the "อีก N นาที" text.
    final progress = dailyLimitReached
        ? 1.0
        : threshold <= 0
            ? 0.0
            : ((threshold - minutesLeft) / threshold.toDouble()).clamp(0.0, 1.0);

    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFFE3F2FD),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF1E88E5).withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.timer_outlined,
                color: Color(0xFF1976D2),
                size: 18,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'ใช้งานแอพวันนี้ ${elapsedHr > 0 ? "${elapsedHr}ชม. " : ""}${elapsedMin}นาที',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF1565C0),
                  ),
                ),
              ),
              GestureDetector(
                onTap: onClose,
                child: const Icon(Icons.close, size: 16, color: Colors.grey),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progress,
              backgroundColor: Colors.blue.shade100,
              valueColor: const AlwaysStoppedAnimation<Color>(
                Color(0xFF1E88E5),
              ),
              minHeight: 5,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            dailyLimitReached
                ? 'ครบโควตาแล้ววันนี้ ($displayPoints/$dailyMax แต้ม)'
                : 'อีก $minutesLeft นาที จะได้ +$rewardPoints แต้ม',
            style: TextStyle(
              fontSize: 11,
              color: dailyLimitReached ? const Color(0xFF1565C0) : Colors.grey,
              fontWeight: dailyLimitReached ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            'แต้มเวลาใช้งานวันนี้: $displayPoints/$dailyMax (สูงสุด ${dailyLimitCount.toInt()} ครั้ง/วัน)',
            style: const TextStyle(fontSize: 10.5, color: Colors.grey),
          ),
        ],
      ),
    );
  }
}

