import 'package:flutter/material.dart';

class RewardStatsRow extends StatelessWidget {
  final dynamic totalPoints;
  final int redeemedCount;
  final VoidCallback? onStatsPressed;
  final VoidCallback? onCommunityTap;
  final VoidCallback? onActivityTap;

  const RewardStatsRow({
    super.key,
    required this.totalPoints,
    this.redeemedCount = 0,
    this.onStatsPressed,
    this.onCommunityTap,
    this.onActivityTap,
  });

  @override
  Widget build(BuildContext context) {
    final pts = (totalPoints as num?)?.toDouble() ?? 0.0;
    final pointsStr = pts >= 1000
      ? '${(pts / 1000).toInt()}k'
      : pts.toInt().toString();

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
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
      child: Row(
        children: [
          _buildStatItem(
            icon: Icons.star_rounded,
            value: '$pointsStr แต้ม',
            label: 'แต้มสะสม',
            color: const Color(0xFFFFB300),
          ),
          _buildDivider(),
          _buildStatItem(
            icon: Icons.local_offer_rounded,
            value: '$redeemedCount รางวัล',
            label: 'แลกส่วนลด',
            color: const Color(0xFF4CAF50),
          ),
          _buildDivider(),
          _buildStatItem(
            icon: Icons.people_rounded,
            value: 'ดูทุกวัน',
            label: 'ชุมชน',
            color: const Color(0xFF2196F3),
            onTap: onCommunityTap,
          ),
          _buildDivider(),
          _buildStatItem(
            icon: Icons.calendar_today_rounded,
            value: 'ข่าวสาร',
            label: 'กิจกรรม',
            color: const Color(0xFFFF9800),
            onTap: onActivityTap,
          ),
        ],
      ),
    );
  }

  Widget _buildStatItem({
    required IconData icon,
    required String value,
    required String label,
    required Color color,
    VoidCallback? onTap,
  }) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: color, size: 22),
            ),
            const SizedBox(height: 6),
            Text(
              value,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: color,
              ),
              textAlign: TextAlign.center,
            ),
            Text(
              label,
              style: const TextStyle(fontSize: 10, color: Colors.grey),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDivider() =>
      Container(width: 1, height: 44, color: Colors.grey.shade200);
}
