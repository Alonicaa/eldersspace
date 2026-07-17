import 'dart:async';
import 'package:flutter/material.dart';

/// สถานะจริง (รอใช้ที่ร้าน/ใช้แล้ว/หมดอายุ/ยกเลิก) พร้อม countdown เวลาที่เหลือ
/// ก่อนโค้ดหมดอายุ — ใช้ร่วมกันทั้งหน้าประวัติแลกรางวัลและหน้าแจ้งเตือน
class RedeemStatusBadge extends StatefulWidget {
  final dynamic expiresAt;
  final String status;

  const RedeemStatusBadge({super.key, required this.expiresAt, required this.status});

  @override
  State<RedeemStatusBadge> createState() => _RedeemStatusBadgeState();
}

class _RedeemStatusBadgeState extends State<RedeemStatusBadge> {
  Timer? _timer;
  int _remainingSeconds = 0;

  @override
  void initState() {
    super.initState();
    _updateRemaining();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(_updateRemaining);
    });
  }

  void _updateRemaining() {
    if (widget.expiresAt == null) {
      _remainingSeconds = 0;
      return;
    }
    try {
      final raw = widget.expiresAt.toString();
      final normalized = raw.contains('T') ? raw : raw.replaceFirst(' ', 'T');
      final isoStr = (normalized.endsWith('Z') || normalized.contains('+'))
          ? normalized
          : '${normalized}Z';
      final dt = DateTime.parse(isoStr).toLocal();
      final secs = dt.difference(DateTime.now()).inSeconds;
      _remainingSeconds = secs < 0 ? 0 : secs;
    } catch (_) {
      _remainingSeconds = 0;
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String _formatTime(int seconds) {
    final minutes = seconds ~/ 60;
    final secs = seconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final isUsed = widget.status == 'used';
    final isCancelled = widget.status == 'cancelled';
    final isExpired = widget.status == 'expired' ||
        (!isUsed &&
            !isCancelled &&
            widget.expiresAt != null &&
            _remainingSeconds <= 0);

    final String label;
    final String icon;
    final Color color;
    if (isUsed) {
      label = 'ใช้แล้ว';
      icon = '✓';
      color = const Color(0xFF27C77F);
    } else if (isCancelled) {
      label = 'ยกเลิก';
      icon = '✕';
      color = Colors.red;
    } else if (isExpired) {
      label = 'หมดอายุ';
      icon = '⏰';
      color = Colors.grey.shade600;
    } else {
      label = 'รอใช้ที่ร้าน';
      icon = '⏳';
      color = Colors.orange.shade700;
    }

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: color.withAlpha(26),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: color.withAlpha(128)),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(icon, style: TextStyle(fontSize: 18, color: color)),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
              ),
            ],
          ),
        ),
        if (!isUsed && !isCancelled && widget.expiresAt != null) ...[
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                isExpired ? Icons.timer_off : Icons.timer_outlined,
                size: 14,
                color: isExpired
                    ? Colors.grey.shade600
                    : (_remainingSeconds <= 300
                        ? Colors.red.shade600
                        : Colors.orange.shade700),
              ),
              const SizedBox(width: 4),
              Text(
                isExpired
                    ? 'หมดอายุแล้ว'
                    : 'เหลือเวลาแลกที่ร้าน ${_formatTime(_remainingSeconds)} นาที',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: isExpired
                      ? Colors.grey.shade600
                      : (_remainingSeconds <= 300
                          ? Colors.red.shade600
                          : Colors.orange.shade700),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}
