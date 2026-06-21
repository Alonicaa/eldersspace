import 'package:flutter/material.dart';

class RewardCard extends StatelessWidget {
  final String rewardName;
  final num pointsRequired;
  final num? pointsAvailable;
  final DateTime? expiryDate;
  final VoidCallback onRedeem;
  final bool isRedeemed;
  final bool isCanRedeem;

  const RewardCard({
    required this.rewardName,
    required this.pointsRequired,
    this.pointsAvailable,
    this.expiryDate,
    required this.onRedeem,
    this.isRedeemed = false,
    this.isCanRedeem = false,
  });

  String _formatDate(DateTime? date) {
    if (date == null) return '-';
    try {
      return '${date.day}/${date.month}/${date.year}';
    } catch (_) {
      return '-';
    }
  }

  String _formatRemainingDays(DateTime? date) {
    if (date == null) return '-';
    try {
      final remaining = date.difference(DateTime.now()).inDays;
      if (remaining < 0) return 'หมดอายุแล้ว';
      if (remaining == 0) return 'หมดอายุวันนี้';
      return '$remaining วัน';
    } catch (_) {
      return '-';
    }
  }

  @override
  Widget build(BuildContext context) {
    final pointsAvail = (pointsAvailable ?? 0).toDouble();
    final required = pointsRequired.toDouble();
    final canRedeem = isCanRedeem && pointsAvail >= required;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: isRedeemed
              ? Colors.grey.shade300
              : canRedeem
                  ? const Color(0xFF3B6FD4)
                  : Colors.grey.shade200,
          width: 1,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header row ──
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        rewardName,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Colors.black87,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Icon(
                            Icons.star,
                            size: 16,
                            color: const Color(0xFFFFB300),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            '${pointsRequired.toInt()} แต้ม',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: isRedeemed
                                  ? Colors.grey
                                  : canRedeem
                                      ? const Color(0xFF3B6FD4)
                                      : Colors.grey.shade600,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                if (isRedeemed)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade200,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text(
                      'แลกแล้ว',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: Colors.grey,
                      ),
                    ),
                  ),
              ],
            ),

            const SizedBox(height: 12),

            // ── Expiry date ──
            if (expiryDate != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(
                  children: [
                    Icon(
                      Icons.calendar_today,
                      size: 14,
                      color: Colors.grey.shade500,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      'หมดอายุ: ${_formatDate(expiryDate)} (${_formatRemainingDays(expiryDate)})',
                      style: TextStyle(
                        fontSize: 12,
                        color: expiryDate!.isBefore(DateTime.now())
                            ? Colors.red
                            : Colors.grey.shade600,
                      ),
                    ),
                  ],
                ),
              ),

            // ── Points progress bar ──
            if (!isRedeemed && pointsAvail > 0)
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'ความคืบหน้า',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade600,
                        ),
                      ),
                      Text(
                        '${pointsAvail.toInt()} / ${required.toInt()}',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: (pointsAvail / pointsRequired)
                          .clamp(0.0, 1.0)
                          .toDouble(),
                      minHeight: 6,
                      backgroundColor: Colors.grey.shade200,
                      valueColor: AlwaysStoppedAnimation(
                        canRedeem
                            ? const Color(0xFF45BD62)
                            : const Color(0xFF3B6FD4),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
              ),

            // ── Redeem button ──
            if (!isRedeemed)
              SizedBox(
                width: double.infinity,
                height: 44,
                child: ElevatedButton(
                  onPressed: canRedeem ? onRedeem : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: canRedeem
                        ? const Color(0xFF3B6FD4)
                        : Colors.grey.shade300,
                    foregroundColor:
                        canRedeem ? Colors.white : Colors.grey.shade600,
                    disabledForegroundColor: Colors.grey.shade600,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  child: Text(
                    canRedeem
                        ? 'แลกรางวัล'
                      : 'ต้องการ ${(required - pointsAvail).ceil()} แต้มอีก',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Reward stats header
class RewardStatsHeader extends StatelessWidget {
  final int totalPoints;
  final int loginStreak;
  final bool checkedInToday;

  const RewardStatsHeader({
    required this.totalPoints,
    required this.loginStreak,
    required this.checkedInToday,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            const Color(0xFF3B6FD4).withValues(alpha: 0.1),
            const Color(0xFF1877F2).withValues(alpha: 0.1),
          ],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: const Color(0xFF3B6FD4).withValues(alpha: 0.2),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'แต้มของคุณ',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey.shade600,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      const Icon(
                        Icons.star,
                        size: 28,
                        color: Color(0xFFFFB300),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        totalPoints.toString(),
                        style: const TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF3B6FD4),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  const Text(
                    'สตรีคปัจจุบัน',
                    style: TextStyle(fontSize: 14),
                  ),
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: loginStreak > 0
                          ? Colors.orange.withValues(alpha: 0.2)
                          : Colors.grey.shade200,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.local_fire_department,
                          size: 16,
                          color: loginStreak > 0 ? Colors.orange : Colors.grey,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          '$loginStreak วัน',
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            color: loginStreak > 0
                                ? Colors.orange
                                : Colors.grey,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (!checkedInToday)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFF45BD62).withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Row(
                children: [
                  Icon(
                    Icons.check_circle,
                    size: 16,
                    color: Color(0xFF45BD62),
                  ),
                  SizedBox(width: 6),
                  Text(
                    'เช็คอินวันนี้เพื่อได้ 5 แต้ม',
                    style: TextStyle(
                      fontSize: 12,
                      color: Color(0xFF45BD62),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            )
          else
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.grey.shade200,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.check_circle,
                    size: 16,
                    color: Colors.grey.shade500,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    'เช็คอินแล้ววันนี้',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade500,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Transaction history item
class TransactionItem extends StatelessWidget {
  final String sourceType;
  final int points;
  final DateTime timestamp;
  final String? description;

  const TransactionItem({
    required this.sourceType,
    required this.points,
    required this.timestamp,
    this.description,
  });

  String _formatTime(DateTime time) {
    try {
      final hh = time.hour.toString().padLeft(2, '0');
      final mm = time.minute.toString().padLeft(2, '0');
      final dd = time.day.toString().padLeft(2, '0');
      final mo = time.month.toString().padLeft(2, '0');
      return '$dd/$mo/${time.year} $hh:$mm';
    } catch (_) {
      return '-';
    }
  }

  String _sourceLabel(String type) {
    if (type == 'daily_checkin') return 'เช็คอินรายวัน';
    if (type == 'app_time') return 'เวลาใช้งานแอพ';
    if (type.startsWith('streak_bonus_')) return 'โบนัสสตรีค';
    return type;
  }

  IconData _sourceIcon(String type) {
    if (type == 'daily_checkin') return Icons.calendar_today;
    if (type == 'app_time') return Icons.timer;
    if (type.startsWith('streak_bonus_')) return Icons.card_giftcard;
    return Icons.star;
  }

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: const Color(0xFFFFB300).withValues(alpha: 0.2),
          shape: BoxShape.circle,
        ),
        child: Icon(
          _sourceIcon(sourceType),
          size: 20,
          color: const Color(0xFFFFB300),
        ),
      ),
      title: Text(
        _sourceLabel(sourceType),
        style: const TextStyle(
          fontWeight: FontWeight.w600,
          fontSize: 14,
        ),
      ),
      subtitle: Text(
        description ?? _formatTime(timestamp),
        style: TextStyle(
          fontSize: 12,
          color: Colors.grey.shade600,
        ),
      ),
      trailing: Text(
        '+$points',
        style: const TextStyle(
          fontWeight: FontWeight.bold,
          color: Color(0xFF45BD62),
          fontSize: 14,
        ),
      ),
    );
  }
}

