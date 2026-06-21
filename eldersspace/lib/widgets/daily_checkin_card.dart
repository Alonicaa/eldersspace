import 'package:flutter/material.dart';

class DailyCheckInCard extends StatelessWidget {
  final int streak;
  final bool checkedToday;
  final double dailyPoints;
  final int daysLeftToBonus;
  final int nextBonusDay;
  final int streakMilestoneDay;
  final int streakMilestoneBonus;
  final bool isLoading;
  final VoidCallback onCheckIn;

  const DailyCheckInCard({
    super.key,
    required this.streak,
    required this.checkedToday,
    required this.dailyPoints,
    required this.daysLeftToBonus,
    required this.nextBonusDay,
    required this.streakMilestoneDay,
    required this.streakMilestoneBonus,
    required this.onCheckIn,
    this.isLoading = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header with title and streak info ──
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF9C4),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: const Color(0xFFFDD835)),
                ),
                child: const Text(
                  '🏆 เช็คอินรายวัน',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFFF5722).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.local_fire_department,
                      color: Color(0xFFFF5722),
                      size: 14,
                    ),
                    const SizedBox(width: 3),
                    Text(
                      '$streak วัน',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFFFF5722),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // ── Streak bar (10 boxes) ──
          _buildStreakBar(streak),
          const SizedBox(height: 8),

          // ── Streak 30+ info ──
          if (streak >= 30)
            RichText(
              text: const TextSpan(
                style: TextStyle(fontSize: 11, color: Colors.grey),
                children: [
                  TextSpan(text: '🌟 Streak 30+ วัน! '),
                  TextSpan(
                    text: 'รับ 1.2 แต้ม/วัน',
                    style: TextStyle(
                      color: Color(0xFF2E7D32),
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            )
          else
            RichText(
              text: TextSpan(
                style: const TextStyle(fontSize: 11, color: Colors.grey),
                children: [
                  TextSpan(text: '🌿 อีก $daysLeftToBonus วันถึง Streak $nextBonusDay วัน '),
                  TextSpan(
                    text: 'รับโบนัส +$streakMilestoneBonus แต้ม',
                    style: const TextStyle(
                      color: Color(0xFF2E7D32),
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),

          const SizedBox(height: 12),

          // ── Today points info ──
          Row(
            children: [
              const Icon(Icons.star, color: Color(0xFFFFB300), size: 16),
              const SizedBox(width: 4),
              Text(
                'วันนี้ได้ $dailyPoints แต้ม${streak >= 30 ? " (Streak 30+ วัน)" : ""}',
                style: const TextStyle(fontSize: 12, color: Colors.grey),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // ── Check-in button ──
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: checkedToday
                    ? Colors.grey.shade300
                    : const Color(0xFF2E7D32),
                foregroundColor: checkedToday ? Colors.grey : Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
              onPressed: checkedToday || isLoading ? null : onCheckIn,
              child: isLoading
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Text(
                      checkedToday ? '✅ เช็คอินแล้ววันนี้' : 'เช็คอินเลย !',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStreakBar(int streak) {
    final display = 10;
    return Row(
      children: List.generate(display, (i) {
        final dayNum = streak > 10 ? (streak - 9 + i) : (i + 1);
        final isDone = streak >= dayNum && dayNum > 0;
        final isCurrent = dayNum == streak;
        final isBonus = dayNum > 0 && dayNum % streakMilestoneDay == 0;

        return Expanded(
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 2),
            height: 38,
            decoration: BoxDecoration(
              color: isBonus && isDone
                  ? const Color(0xFFFFB300)
                  : isDone
                      ? const Color(0xFF2E7D32)
                      : Colors.grey.shade200,
              borderRadius: BorderRadius.circular(8),
              border: isCurrent
                  ? Border.all(color: const Color(0xFFFFB300), width: 2)
                  : null,
            ),
            child: Center(
              child: Text(
                isBonus ? '🎁' : (dayNum > 0 ? '$dayNum' : ''),
                style: TextStyle(
                  color: isDone ? Colors.white : Colors.grey,
                  fontWeight: FontWeight.bold,
                  fontSize: isBonus ? 14 : 12,
                ),
              ),
            ),
          ),
        );
      }),
    );
  }
}

