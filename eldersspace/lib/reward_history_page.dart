import 'package:flutter/material.dart';
import 'dart:async';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:barcode_widget/barcode_widget.dart';
import 'services/app_config.dart';
import 'services/reward_service.dart';
import 'widgets/redeem_status_badge.dart';

class RewardHistoryPage extends StatefulWidget {
  final String phoneNumber;
  final int initialView;

  const RewardHistoryPage({
    super.key,
    required this.phoneNumber,
    this.initialView = 0,
  });

  @override
  State<RewardHistoryPage> createState() => _RewardHistoryPageState();
}

class _RewardHistoryPageState extends State<RewardHistoryPage> {
  Map<String, dynamic>? _summary;
  Map<String, dynamic>? _rewardSettings;
  List<dynamic> _allTransactions = []; // Store both earned & redeemed
  List<dynamic> _availableRewards = [];
  Map<String, String> _rewardMap = {}; // reward_id -> reward_name mapping
  bool _isLoading = true;
  String _searchQuery = '';
  late int _currentView;
  String _sourceTypeFilter = ''; // '' = ทั้งหมด
  DateTime? _selectedHistoryDate;
  String _selectedRewardCategory = ''; // '' = ทั้งหมด

  @override
  void initState() {
    super.initState();
    _currentView = widget.initialView;
    _loadAll();
    _loadAvailableRewards();
  }

  Future<void> _loadAll() async {
    await _loadSummary();
    _loadRewardSettings();
  }

  Future<void> _loadRewardSettings() async {
    final settings = await RewardService.getRewardSettings();
    if (!mounted) return;
    setState(() {
      _rewardSettings = settings;
    });
  }

  List<dynamic> _safeList(Map<String, dynamic> data, List<String> keys) {
    for (final key in keys) {
      final v = data[key];
      if (v is List) return v;
    }
    return [];
  }

  Future<void> _loadSummary() async {
    try {
      final data = await RewardService.getSummary(widget.phoneNumber);
      if (!mounted) return;
      final recentTx = _safeList(data, [
        'recent_transactions',
        'transactions',
        'transaction_history',
        'history',
        'earn_history',
      ]);
      debugPrint('📋 Earn transactions from summary: ${recentTx.length}');
      final parsed = <Map<String, dynamic>>[];
      for (final tx in recentTx) {
        try {
          if (tx is Map) {
            parsed.add({...Map<String, dynamic>.from(tx), 'has_qr_code': false});
          }
        } catch (_) {}
      }
      if (!mounted) return;
      setState(() {
        _summary = data;
        _allTransactions = parsed;
      });
    } catch (e) {
      debugPrint('❌ _loadSummary error: $e');
    }
    // Load redemption history after earn transactions are set
    await _loadRedemptionHistory();
  }

  Future<void> _loadRedemptionHistory() async {
    try {
      final redemptions = await RewardService.getRedemptionHistory(
        widget.phoneNumber,
      );
      if (!mounted) return;

      final rewardTransactions = <Map<String, dynamic>>[];
      if (redemptions is List) {
        for (final r in redemptions) {
          try {
            if (r is! Map) continue;
            final rMap = Map<String, dynamic>.from(r);
            final rewardName = rMap['reward_name'] ?? rMap['name'] ?? 'รางวัล';
            final pointsRaw = rMap['points_redeemed'];
            final points = pointsRaw is num ? pointsRaw.toInt() : int.tryParse(pointsRaw?.toString() ?? '') ?? 0;
            rewardTransactions.add({
              'source_type': 'reward_${rMap['reward_id']}',
              'reward_name': rewardName,
              'name': rewardName,
              'points': -points,
              'type': 'redeem',
              'created_at': rMap['redeemed_at'] ?? rMap['created_at'],
              'qr_code': rMap['qr_code'] ?? '',
              'redemption_status': rMap['redemption_status'],
              'points_redeemed': rMap['points_redeemed'],
              'used_at': rMap['used_at'],
              'expires_at': rMap['expires_at'],
              'redemption_id': rMap['redemption_id'],
              'reward_id': rMap['reward_id'],
              'phone_number': rMap['phone_number'] ?? widget.phoneNumber,
              'has_qr_code': true,
            });
          } catch (_) {}
        }
      }

      // If summary returned no earn transactions, try dedicated earn history endpoint
      List<Map<String, dynamic>> earnTransactions =
          _allTransactions.whereType<Map<String, dynamic>>().toList();
      if (earnTransactions.isEmpty) {
        final earnData = await RewardService.getEarnHistory(widget.phoneNumber);
        if (!mounted) return;
        for (final tx in earnData) {
          try {
            if (tx is Map) {
              earnTransactions.add({...Map<String, dynamic>.from(tx), 'has_qr_code': false});
            }
          } catch (_) {}
        }
        debugPrint('📋 Earn transactions from dedicated endpoint: ${earnTransactions.length}');
      }

      if (!mounted) return;
      setState(() {
        final merged = [...rewardTransactions, ...earnTransactions];
        merged.sort((a, b) {
          final dateA = DateTime.tryParse((a['created_at'] ?? '').toString());
          final dateB = DateTime.tryParse((b['created_at'] ?? '').toString());
          if (dateA == null && dateB == null) return 0;
          if (dateA == null) return 1;
          if (dateB == null) return -1;
          return dateB.compareTo(dateA);
        });
        _allTransactions = merged;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint('❌ _loadRedemptionHistory error: $e');
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _loadAvailableRewards() async {
    final data = await RewardService.getAvailableRewards(widget.phoneNumber);
    if (!mounted) return;
    final rewardsRaw = data['rewards'];
    final rewards = rewardsRaw is List ? rewardsRaw : [];

    // Build reward map for quick lookup (supports multiple key formats)
    final rewardMap = <String, String>{};
    for (var reward in rewards) {
      final id = reward['reward_id']?.toString() ?? '';
      final name = reward['reward_name']?.toString() ?? '';
      if (id.isNotEmpty && name.isNotEmpty) {
        rewardMap[id] = name; // Key: "1", "2"
        rewardMap['reward_$id'] = name; // Key: "reward_1", "reward_2"
      }
    }
    debugPrint('🎁 Reward map built: $rewardMap');

    setState(() {
      _availableRewards = rewards;
      _rewardMap = rewardMap;
    });
  }

  Future<void> _redeemReward(int rewardId, dynamic reward) async {
    try {
      final result = await RewardService.redeemReward(
        widget.phoneNumber,
        rewardId,
      );
      debugPrint('🎁 Redeem result: $result');
      if (!mounted) return;
      if (result['success'] == true) {
        // Show success screen with QR code
        final qrCode =
            result['qr_code'] ?? 'LT${DateTime.now().millisecondsSinceEpoch}';
        // promo_code from CSV — separate from the system QR code
        final promoCode = result['has_promo_code'] == true
            ? (result['promo_code'] as String?)
            : null;
        debugPrint('🎁 QR Code: $qrCode');
        debugPrint('🎁 Promo Code from CSV: $promoCode');
        debugPrint('🎁 Expires at: ${result['qr_expires_at']}');

        // Fetch the complete redemption record from database
        final redemptionRecord = await RewardService.getLatestRedemption(
          widget.phoneNumber,
          qrCode,
        );
        debugPrint('🎁 Redemption record: $redemptionRecord');

        _showRedemptionSuccess(
          redemptionRecord.isNotEmpty ? redemptionRecord : result,
          qrCode,
          result['qr_expires_at'] ?? redemptionRecord['expires_at'],
          reward,
          promoCode: promoCode,
          promoCodeDescription: result['promo_code_description'] as String?,
          promoCodeExpiry: result['promo_code_expiry']?.toString(),
        );
        _loadSummary();
        _loadAvailableRewards();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result['error'] ?? 'แลกรางวัลไม่สำเร็จ')),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('เกิดข้อผิดพลาด: $e')));
    }
  }

  String _sourceLabel(String sourceType, [Map<String, dynamic>? item]) {
    if (sourceType == 'daily_checkin') return 'เช็คอินรายวัน';
    if (sourceType == 'app_time') return 'เวลาใช้งานแอพ';
    if (sourceType.startsWith('streak_bonus_')) return 'โบนัสสตรีค';

    // Handle reward redemption - try to get reward name from item first
    if (item?['reward_name'] != null) {
      return item!['reward_name'].toString();
    }

    // Try to get reward name from sourceType if it's a reward ID (e.g., "1", "2")
    if (sourceType.startsWith('reward_')) {
      final rewardId = sourceType.replaceFirst('reward_', '');
      if (_rewardMap.containsKey(rewardId)) {
        return _rewardMap[rewardId]!;
      }
      // If not found, try direct lookup in case sourceType is just the ID
      if (_rewardMap.containsKey(sourceType)) {
        return _rewardMap[sourceType]!;
      }
    }

    // Fallback to sourceType as-is
    return sourceType;
  }

  String _clean(String s) => s
      .replaceAll(r'\r\n', '\n')
      .replaceAll(r'\n', '\n')
      .replaceAll(r'\r', '\n')
      .trim();

  String _formatDateTime(dynamic value) {
    if (value == null) return '-';
    try {
      final raw = value.toString();
      final utcStr = raw.endsWith('Z') || raw.contains('+') ? raw : '${raw}Z';
      final dt = DateTime.parse(utcStr).add(const Duration(hours: 7));
      final hh = dt.hour.toString().padLeft(2, '0');
      final mm = dt.minute.toString().padLeft(2, '0');
      final dd = dt.day.toString().padLeft(2, '0');
      final mo = dt.month.toString().padLeft(2, '0');
      return '$dd/$mo/${dt.year} $hh:$mm';
    } catch (_) {
      return value.toString();
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // UPDATED: _showRedeemConfirmation — popup ตามแบบ UI ในรูปตัวอย่าง
  // ─────────────────────────────────────────────────────────────────────
  void _showRedeemConfirmation(dynamic reward) async {
    final name = (reward['name'] ?? 'รางวัล').toString();
    final cost = (reward['points_required'] ?? 0).toInt();
    final currentPoints = (_summary?['total_points'] ?? 0).toInt();
    final remainingPoints = currentPoints - cost;
    final description = _clean((reward['description'] ?? '').toString());
    final imageUrl = _resolveRewardImageUrl(
      (reward['image_url'] ?? '').toString(),
    );
    
    // Extract start and end dates (raw) then parse to DateTime
    final rawStart = reward['start_date'] ??
        reward['valid_from'] ??
        reward['campaign_start_date'] ??
        reward['created_at'];
    final rawEnd = reward['end_date'] ??
        reward['expires_at'] ??
        reward['valid_to'] ??
        reward['campaign_end_date'];

    final parsedStart = _parseToDateTime(rawStart);
    final parsedEnd = _parseToDateTime(rawEnd);

    // If already expired, show message and don't proceed
    if (parsedEnd != null) {
      final now = DateTime.now();
      if (parsedEnd.isBefore(now)) {
        // show a quick dialog informing expired
        await showDialog<void>(
          context: context,
          builder: (c) => AlertDialog(
            title: const Text('หมดอายุ'),
            content: const Text('ขออภัย รางวัลนี้หมดอายุแล้ว'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(c).pop(),
                child: const Text('ปิด'),
              ),
            ],
          ),
        );
        return;
      }
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
        clipBehavior: Clip.antiAlias,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // ── ส่วนบน: รูปรางวัล / โลโก้ + ปุ่มปิด ──
                Stack(
                  children: [
                    Container(
                      width: double.infinity,
                      color: Colors.white,
                      padding: const EdgeInsets.fromLTRB(24, 28, 24, 20),
                      child: Center(
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.grey.shade50,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: Colors.grey.shade200),
                          ),
                          // รูปรางวัล (ถ้ามี) หรือ icon placeholder
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(14),
                            child: imageUrl.isNotEmpty
                                ? Image.network(
                                    imageUrl,
                                    height: 120,
                                    width: 200,
                                    fit: BoxFit.contain,
                                    loadingBuilder:
                                        (context, child, loadingProgress) {
                                      if (loadingProgress == null) return child;
                                      return SizedBox(
                                        height: 120,
                                        width: 200,
                                        child: Center(
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                            color: Colors.grey.shade400,
                                          ),
                                        ),
                                      );
                                    },
                                    errorBuilder: (context, error, stackTrace) =>
                                        _buildIconPlaceholder(),
                                  )
                                : _buildIconPlaceholder(),
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      top: 8,
                      right: 8,
                      child: GestureDetector(
                        onTap: () => Navigator.pop(context, false),
                        child: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: Colors.grey.shade100,
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            Icons.close_rounded,
                            size: 22,
                            color: Colors.grey.shade700,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),

                // ── ส่วนล่าง: ข้อมูล + ปุ่ม ──
                Container(
                  color: const Color(0xFFF2F0F8), // พื้นหลังม่วงอ่อน
                  padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Points badge
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 24,
                          vertical: 10,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFA500),
                          borderRadius: BorderRadius.circular(28),
                          boxShadow: [
                            BoxShadow(
                              color: const Color(0xFFFFA500).withValues(alpha: 0.3),
                              blurRadius: 10,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.star_rounded, color: Colors.white, size: 20),
                            const SizedBox(width: 6),
                            Text(
                              '$cost แต้ม',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 18,
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),

                      // ชื่อรางวัล
                      Text(
                        name,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.bold,
                          color: Colors.black87,
                          height: 1.3,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 18),

                      // ── ตารางคำนวณแต้ม ──
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 18,
                          vertical: 16,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(18),
                        ),
                        child: Column(
                          children: [
                            _buildRedeemCalcRow(
                              icon: Icons.account_balance_wallet_outlined,
                              iconColor: Colors.grey.shade500,
                              label: 'แต้มของคุณ',
                              value: '$currentPoints แต้ม',
                              valueColor: Colors.black87,
                            ),
                            const SizedBox(height: 12),
                            Divider(color: Colors.grey.shade200, height: 1),
                            const SizedBox(height: 12),
                            _buildRedeemCalcRow(
                              icon: Icons.remove_circle_outline,
                              iconColor: Colors.red.shade300,
                              label: 'ใช้แลก',
                              value: '- $cost แต้ม',
                              valueColor: Colors.red,
                            ),
                            const SizedBox(height: 12),
                            Divider(color: Colors.grey.shade200, height: 1),
                            const SizedBox(height: 12),
                            _buildRedeemCalcRow(
                              icon: Icons.check_circle_outline,
                              iconColor: remainingPoints < 0
                                  ? Colors.red.shade300
                                  : Colors.green.shade400,
                              label: 'แต้มคงเหลือ',
                              value: '$remainingPoints แต้ม',
                              valueColor: remainingPoints < 0
                                  ? Colors.red
                                  : Colors.green.shade600,
                            ),
                          ],
                        ),
                      ),

                      // Description box (ถ้ามี)
                      if (description.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: Colors.amber.shade50,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: Colors.amber.shade200),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Icon(Icons.description_outlined,
                                      size: 16, color: Colors.amber.shade900),
                                  const SizedBox(width: 6),
                                  Text(
                                    'รายละเอียด',
                                    style: TextStyle(
                                      fontSize: 13,
                                      color: Colors.amber.shade900,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                description,
                                style: TextStyle(
                                  fontSize: 14,
                                  color: Colors.amber.shade800,
                                  height: 1.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],

                      // Validity Period (ถ้ามี)
                      if (parsedStart != null || parsedEnd != null) ...[
                        const SizedBox(height: 12),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: Colors.blue.shade50,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: Colors.blue.shade200),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Icon(Icons.event_outlined,
                                      size: 16, color: Colors.blue.shade900),
                                  const SizedBox(width: 6),
                                  Text(
                                    'ระยะเวลา',
                                    style: TextStyle(
                                      fontSize: 13,
                                      color: Colors.blue.shade900,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              if (parsedStart != null)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 4),
                                  child: RichText(
                                    text: TextSpan(
                                      children: [
                                        TextSpan(
                                          text: 'เริ่มตั้งแต่: ',
                                          style: TextStyle(
                                            fontSize: 13,
                                            color: Colors.blue.shade700,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                        TextSpan(
                                          text: _formatDateTimeForDetail(parsedStart),
                                          style: TextStyle(
                                            fontSize: 13,
                                            color: Colors.blue.shade900,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              if (parsedEnd != null)
                                RichText(
                                  text: TextSpan(
                                    children: [
                                      TextSpan(
                                        text: 'สิ้นสุด: ',
                                        style: TextStyle(
                                          fontSize: 13,
                                          color: Colors.blue.shade700,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      TextSpan(
                                        text: _formatDateTimeForDetail(parsedEnd),
                                        style: TextStyle(
                                          fontSize: 13,
                                          color: Colors.blue.shade900,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ],

                      const SizedBox(height: 22),

                      // คำถามยืนยัน
                      Text(
                        'ยืนยันการแลกรางวัล',
                        style: TextStyle(
                          fontSize: 14,
                          color: Colors.grey.shade600,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'คุณต้องการแลกรับรางวัลนี้ใช่หรือไม่?',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: Colors.black87,
                        ),
                      ),
                      const SizedBox(height: 22),

                      // ปุ่มยืนยัน
                      SizedBox(
                        width: double.infinity,
                        height: 54,
                        child: ElevatedButton.icon(
                          onPressed: () => Navigator.pop(context, true),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF27C77F),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(32),
                            ),
                            elevation: 0,
                          ),
                          icon: const Icon(
                            Icons.check_circle_outline,
                            color: Colors.white,
                            size: 22,
                          ),
                          label: const Text(
                            'ยืนยันแลกรางวัล',
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 17,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 10),

                      // ปุ่มยกเลิก
                      SizedBox(
                        width: double.infinity,
                        height: 48,
                        child: OutlinedButton(
                          onPressed: () => Navigator.pop(context, false),
                          style: OutlinedButton.styleFrom(
                            side: BorderSide(color: Colors.grey.shade300, width: 1.5),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(32),
                            ),
                          ),
                          child: Text(
                            'ยกเลิก',
                            style: TextStyle(
                              fontSize: 15,
                              color: Colors.grey.shade700,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 18),

                      // Footer
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.info_outline, size: 14, color: Colors.grey.shade600),
                          const SizedBox(width: 6),
                          Flexible(
                            child: Text(
                              'โปรดแสดงหลักฐานคิวอาร์โค้ด\nสำหรับแลกรับส่วนลดที่จุดแลกส่วนลด',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey.shade600,
                                height: 1.5,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    if (confirmed == true) {
      await _redeemReward(reward['reward_id'] ?? 0, reward);
    }
  }

  /// Widget placeholder เมื่อไม่มีรูป
  Widget _buildIconPlaceholder() {
    return Container(
      height: 120,
      width: 200,
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(
        Icons.card_giftcard,
        size: 64,
        color: Colors.teal.shade300,
      ),
    );
  }

  /// แถวในตารางคำนวณแต้ม (แต้มของคุณ / ใช้แลก / แต้มคงเหลือ)
  Widget _buildRedeemCalcRow({
    required IconData icon,
    required Color iconColor,
    required String label,
    required String value,
    required Color valueColor,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Row(
          children: [
            Icon(icon, size: 18, color: iconColor),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(fontSize: 14, color: Colors.grey.shade700),
            ),
          ],
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.bold,
            color: valueColor,
          ),
        ),
      ],
    );
  }

  void _showRedemptionSuccess(
    dynamic redemptionData,
    String qrCode,
    dynamic expiresAt,
    dynamic originalReward, {
    String? promoCode,
    String? promoCodeDescription,
    String? promoCodeExpiry,
  }) {
    // Note: Notification is already created by backend in redeemReward endpoint
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => _QRCodeRedemptionDialog(
        reward: redemptionData,
        qrCode: qrCode,
        expiresAt: expiresAt,
        phoneNumber: widget.phoneNumber,
        originalReward: originalReward,
        promoCode: promoCode,
        promoCodeDescription: promoCodeDescription,
        promoCodeExpiry: promoCodeExpiry,
      ),
    );
  }

  Map<String, dynamic> _convertToStringKeyMap(dynamic data) {
    if (data is Map<String, dynamic>) {
      return data;
    }
    if (data is Map) {
      return Map<String, dynamic>.from(data);
    }
    return {};
  }

  void _showReportCodeSheet({required int redemptionId, required String rewardName}) {
    String selectedType = 'not_working';
    final descController = TextEditingController();
    bool isSubmitting = false;

    final issueLabels = {
      'not_working': 'โค้ดใช้งานไม่ได้',
      'wrong_reward': 'รางวัลไม่ตรง',
      'already_expired': 'โค้ดหมดอายุแล้ว',
      'other': 'อื่นๆ',
    };

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
          child: Container(
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
            ),
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Center(
                    child: Container(
                      width: 40, height: 4,
                      decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2)),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text('แจ้งปัญหาโค้ด', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  Text(rewardName, style: TextStyle(fontSize: 13, color: Colors.grey.shade600), maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 20),
                  const Text('ประเภทปัญหา', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: issueLabels.entries.map((e) {
                      final selected = selectedType == e.key;
                      return GestureDetector(
                        onTap: () => setSheetState(() => selectedType = e.key),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          decoration: BoxDecoration(
                            color: selected ? Colors.orange.shade700 : Colors.grey.shade100,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: selected ? Colors.orange.shade700 : Colors.grey.shade300),
                          ),
                          child: Text(e.value, style: TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w500,
                            color: selected ? Colors.white : Colors.grey.shade700,
                          )),
                        ),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 20),
                  const Text('รายละเอียดเพิ่มเติม (ถ้ามี)', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: descController,
                    maxLines: 3,
                    decoration: InputDecoration(
                      hintText: 'อธิบายปัญหาที่พบ...',
                      hintStyle: TextStyle(color: Colors.grey.shade400, fontSize: 13),
                      filled: true,
                      fillColor: Colors.grey.shade50,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade300)),
                      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: Colors.grey.shade300)),
                      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Colors.orange, width: 1.5)),
                      contentPadding: const EdgeInsets.all(12),
                    ),
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: isSubmitting ? null : () async {
                        setSheetState(() => isSubmitting = true);
                        final result = await RewardService.reportCode(
                          phoneNumber: widget.phoneNumber,
                          redemptionId: redemptionId,
                          issueType: selectedType,
                          description: descController.text.trim().isEmpty ? null : descController.text.trim(),
                        );
                        if (!mounted) return;
                        Navigator.pop(ctx);
                        if (result['success'] == true) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: const Text('แจ้งปัญหาสำเร็จ ทีมงานจะตรวจสอบและติดต่อกลับ'),
                              backgroundColor: Colors.green.shade600,
                              behavior: SnackBarBehavior.floating,
                            ),
                          );
                        } else {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(result['error']?.toString() ?? 'เกิดข้อผิดพลาด'),
                              backgroundColor: Colors.red.shade600,
                              behavior: SnackBarBehavior.floating,
                            ),
                          );
                        }
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.orange.shade700,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        elevation: 0,
                      ),
                      child: isSubmitting
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('ส่งรายงาน', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _showRewardDetail(Map<String, dynamic> reward) {
    // Ensure reward is properly typed
    reward = _convertToStringKeyMap(reward);

    // Try multiple field names for qr_code
    final qrCode =
        reward['qr_code'] ?? reward['code'] ?? reward['QRCode'] ?? '';
    final rewardName = reward['reward_name'] ?? reward['name'] ?? 'รางวัล';
    final pointsUsed = (reward['points_redeemed'] ?? reward['points'] ?? 0)
        .toInt()
        .abs();
    final expiresAt = reward['expires_at'];
    final createdAt = reward['created_at'] ?? reward['redeemed_at'];
    final usageInstructions =
        reward['usage_instructions'] ?? reward['instruction'] ?? '';
    final validityHours = reward['validity_hours'] ?? 1;

    showDialog(
      context: context,
      builder: (context) => Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
        clipBehavior: Clip.antiAlias,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Header
                Container(
                  padding: const EdgeInsets.fromLTRB(20, 18, 12, 18),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border(
                      bottom: BorderSide(color: Colors.grey.shade100, width: 1),
                    ),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          rewardName,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: Colors.black87,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      GestureDetector(
                        onTap: () => Navigator.pop(context),
                        child: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: Colors.grey.shade100,
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            Icons.close_rounded,
                            size: 20,
                            color: Colors.grey.shade700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                // Content
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Status Badge (สถานะจริง + countdown หมดอายุ)
                      RedeemStatusBadge(
                        expiresAt: expiresAt,
                        status: (reward['redemption_status'] ??
                                reward['status'] ??
                                'pending')
                            .toString(),
                      ),
                      const SizedBox(height: 18),

                      // QR Code Container
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: Colors.grey.shade200),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.04),
                              blurRadius: 12,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: Column(
                          children: [
                            // QR Code
                            if (qrCode.isNotEmpty)
                              Container(
                                height: 180,
                                width: 180,
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(12),
                                  border:
                                      Border.all(color: Colors.grey.shade200),
                                ),
                                child: QrImageView(
                                  data: qrCode,
                                  version: QrVersions.auto,
                                  size: 164,
                                  backgroundColor: Colors.white,
                                  foregroundColor: Colors.black,
                                ),
                              )
                            else
                              Container(
                                height: 180,
                                width: 180,
                                decoration: BoxDecoration(
                                  color: Colors.grey.shade100,
                                  borderRadius: BorderRadius.circular(12),
                                  border:
                                      Border.all(color: Colors.grey.shade300),
                                ),
                                child: Center(
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(
                                        Icons.qr_code_2,
                                        size: 48,
                                        color: Colors.grey.shade400,
                                      ),
                                      const SizedBox(height: 8),
                                      Text(
                                        'ไม่มี QR Code',
                                        style: TextStyle(
                                          color: Colors.grey.shade600,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            const SizedBox(height: 14),
                            // QR Code text + ปุ่มคัดลอก
                            if (qrCode.isNotEmpty)
                              GestureDetector(
                                onTap: () {
                                  Clipboard.setData(ClipboardData(text: qrCode));
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('คัดลอกโค้ดแล้ว'),
                                      duration: Duration(seconds: 2),
                                    ),
                                  );
                                },
                                child: Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 14,
                                    vertical: 12,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Colors.grey.shade50,
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(
                                        color: Colors.grey.shade300),
                                  ),
                                  child: Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.center,
                                    children: [
                                      Flexible(
                                        child: Text(
                                          qrCode,
                                          style: const TextStyle(
                                            fontSize: 14,
                                            fontWeight: FontWeight.w600,
                                            fontFamily: 'monospace',
                                            color: Colors.black87,
                                          ),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Icon(
                                        Icons.copy_rounded,
                                        size: 16,
                                        color: Colors.grey.shade600,
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 18),

                      // Details
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade50,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Column(
                          children: [
                            _buildRewardDetailRow(
                              Icons.card_giftcard_outlined,
                              'รางวัล',
                              rewardName,
                            ),
                            _buildRewardDetailRow(
                              Icons.star_outline_rounded,
                              'แต้มที่ใช้',
                              '$pointsUsed แต้ม',
                            ),
                            _buildRewardDetailRow(
                              Icons.event_outlined,
                              'วันแลก',
                              createdAt != null
                                  ? _formatDateTimeForDetail(createdAt)
                                  : '-',
                            ),
                            if (expiresAt != null)
                              _buildRewardDetailRow(
                                Icons.event_busy_outlined,
                                'วันหมดอายุ',
                                _formatDateTimeForDetail(expiresAt),
                              ),
                            if (validityHours > 0)
                              _buildRewardDetailRow(
                                Icons.hourglass_bottom_outlined,
                                'ใช้ได้ภายใน',
                                validityHours > 24
                                    ? '${(validityHours / 24).toStringAsFixed(1)} วัน'
                                    : '$validityHours ชั่วโมง',
                              ),
                            if (usageInstructions.isNotEmpty)
                              _buildRewardDetailRow(
                                Icons.info_outline,
                                'วิธีใช้',
                                usageInstructions,
                                isLast: (reward['usage_instructions'] ?? '')
                                        .toString()
                                        .isEmpty ||
                                    reward['usage_instructions'].toString() ==
                                        usageInstructions,
                              ),
                            if ((reward['usage_instructions'] ?? '')
                                    .toString()
                                    .isNotEmpty &&
                                (usageInstructions.isEmpty ||
                                    reward['usage_instructions'].toString() !=
                                        usageInstructions))
                              _buildRewardDetailRow(
                                Icons.rule_outlined,
                                'เงื่อนไขการใช้',
                                reward['usage_instructions'].toString(),
                                isLast: true,
                              ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 20),

                      // Redemption Format Selection
                      if (qrCode.isNotEmpty)
                        _buildRedemptionFormatSelector(
                          context,
                          qrCode,
                          rewardName,
                        ),

                      const SizedBox(height: 20),

                      // Close button
                      SizedBox(
                        width: double.infinity,
                        height: 52,
                        child: ElevatedButton(
                          onPressed: () => Navigator.pop(context),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF1565C0),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(32),
                            ),
                            elevation: 0,
                          ),
                          child: const Text(
                            'ปิด',
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// แถวรายละเอียดแบบมีไอคอน ใช้ใน dialog แสดงโค้ด/QR ของรางวัลที่แลกแล้ว
  Widget _buildRewardDetailRow(
    IconData icon,
    String label,
    String value, {
    bool isLast = false,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(
        border: isLast
            ? null
            : Border(
                bottom: BorderSide(color: Colors.grey.shade200, width: 1),
              ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: Colors.grey.shade500),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
            ),
          ),
          const SizedBox(width: 12),
          Flexible(
            flex: 2,
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: Colors.black87,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRedemptionFormatSelector(
    BuildContext context,
    String qrCode,
    String rewardName,
  ) {
    return Column(
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: Colors.blue.shade50,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.blue.shade200),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'เลือกวิธีแลก',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Colors.blue.shade700,
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _buildFormatOption(
                      icon: Icons.qr_code_2,
                      label: 'QR Code',
                      color: Colors.blue,
                      onTap: () =>
                          _showRedemptionFormat('qr_code', qrCode, rewardName),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _buildFormatOption(
                      icon: Icons.barcode_reader,
                      label: 'Barcode',
                      color: Colors.orange,
                      onTap: () =>
                          _showRedemptionFormat('barcode', qrCode, rewardName),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _buildFormatOption(
                      icon: Icons.tag,
                      label: 'Code',
                      color: Colors.blue,
                      onTap: () =>
                          _showRedemptionFormat('code', qrCode, rewardName),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildFormatOption({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: color.withAlpha(140), width: 1.5),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: color, size: 26),
              const SizedBox(height: 6),
              Text(
                label,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showRewardCodes(dynamic rewardId, String rewardName) {
    showDialog(
      context: context,
      builder: (context) => _RewardCodesDialog(
        rewardId: rewardId,
        rewardName: rewardName,
        phoneNumber: widget.phoneNumber,
      ),
    );
  }

  void _showRedemptionFormat(String format, String qrCode, String rewardName) {
    String displayCode = qrCode;
    String formatTitle = format;

    switch (format) {
      case 'qr_code':
        formatTitle = 'QR Code';
        break;
      case 'barcode':
        formatTitle = 'Barcode';
        break;
      case 'code':
        formatTitle = 'Code';
        break;
    }

    showDialog(
      context: context,
      builder: (context) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Header
              Container(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                decoration: BoxDecoration(
                  color: Colors.blue.shade50,
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(16),
                    topRight: Radius.circular(16),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    GestureDetector(
                      onTap: () => Navigator.pop(context),
                      child: const Icon(Icons.arrow_back, size: 24),
                    ),
                    Expanded(
                      child: Text(
                        formatTitle,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 24),
                  ],
                ),
              ),
              // Content
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      rewardName,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 20),

                    if (format == 'qr_code')
                      Container(
                        height: 200,
                        width: 200,
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.grey.shade200),
                        ),
                        child: QrImageView(
                          data: displayCode,
                          version: QrVersions.auto,
                          size: 184,
                          backgroundColor: Colors.white,
                          foregroundColor: Colors.black,
                        ),
                      )
                    else if (format == 'barcode')
                      Container(
                        height: 100,
                        width: 200,
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.grey.shade200),
                        ),
                        child: BarcodeWidget(
                          barcode: Barcode.code128(),
                          data: displayCode,
                          drawText: true,
                        ),
                      )
                    else
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade50,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.grey.shade200),
                        ),
                        child: SelectableText(
                          displayCode,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            fontFamily: 'monospace',
                            color: Colors.black87,
                          ),
                        ),
                      ),

                    const SizedBox(height: 20),

                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.blue.shade50,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.blue.shade200),
                      ),
                      child: Text(
                        'แสดง$formatTitleนี้ที่จุดแลกรับเพื่อรับรางวัลของคุณ',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.blue.shade700,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),

                    const SizedBox(height: 20),

                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: () => Navigator.pop(context),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.blue,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: const Text(
                          'ปิด',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatDateTimeForDetail(dynamic value) {
    try {
      DateTime dt;
      if (value is String) {
        final raw = value;
        final utcStr = raw.endsWith('Z') || raw.contains('+') ? raw : '${raw}Z';
        dt = DateTime.parse(utcStr).add(const Duration(hours: 7));
      } else if (value is DateTime) {
        dt = value.toUtc().add(const Duration(hours: 7));
      } else {
        return '-';
      }
      final hh = dt.hour.toString().padLeft(2, '0');
      final mm = dt.minute.toString().padLeft(2, '0');
      return '${dt.day} ${_getMonthName(dt.month)} ${dt.year}  $hh:$mm';
    } catch (_) {}
    return '-';
  }

  DateTime? _parseToDateTime(dynamic v) {
    if (v == null) return null;
    try {
      if (v is DateTime) return v.toLocal();
      if (v is String) {
        return DateTime.parse(v).toLocal();
      }
      if (v is int) {
        // Accept seconds or milliseconds
        if (v > 1000000000000) {
          return DateTime.fromMillisecondsSinceEpoch(v).toLocal();
        } else {
          return DateTime.fromMillisecondsSinceEpoch(v * 1000).toLocal();
        }
      }
      if (v is Map) {
        // Firestore-like map {seconds: ..., nanoseconds: ...}
        if (v.containsKey('seconds')) {
          final s = v['seconds'];
          if (s is int) return DateTime.fromMillisecondsSinceEpoch(s * 1000).toLocal();
        }
        if (v.containsKey('_seconds')) {
          final s = v['_seconds'];
          if (s is int) return DateTime.fromMillisecondsSinceEpoch(s * 1000).toLocal();
        }
      }
    } catch (_) {}
    return null;
  }

  String _getMonthName(int month) {
    const months = [
      'ม.ค.',
      'ก.พ.',
      'มี.ค.',
      'เม.ย.',
      'พ.ค.',
      'มิ.ย.',
      'ก.ค.',
      'ส.ค.',
      'ก.ย.',
      'ต.ค.',
      'พ.ย.',
      'ธ.ค.',
    ];
    return month >= 1 && month <= 12 ? months[month - 1] : '';
  }

  @override
  Widget build(BuildContext context) {
    final hasError = _summary?['error'] != null;
    final totalPointsValue = _summary?['total_points'] ?? 0;
    final totalPoints = (totalPointsValue is num)
      ? totalPointsValue.toInt().toString()
      : totalPointsValue.toString().split('.').first;
    final textScale = MediaQuery.textScalerOf(context).scale(1.0);
    final tx = _allTransactions;

    // Filter transactions based on search, source type, and date
    final filteredTx = tx.where((item) {
      final itemMap = _convertToStringKeyMap(item);
      final sourceType = (itemMap['source_type'] ?? '').toString();
      final sourceLabel = _sourceLabel(sourceType, itemMap);
      final matchesSearch = sourceLabel.toLowerCase().contains(
        _searchQuery.toLowerCase(),
      );

      final matchesSourceType =
          _sourceTypeFilter.isEmpty || sourceType == _sourceTypeFilter;

      bool matchesDate = true;
      if (_selectedHistoryDate != null) {
        try {
          final itemDate = DateTime.parse(
            (itemMap['created_at'] ?? '').toString(),
          ).toLocal();
          matchesDate =
              itemDate.year == _selectedHistoryDate!.year &&
              itemDate.month == _selectedHistoryDate!.month &&
              itemDate.day == _selectedHistoryDate!.day;
        } catch (_) {
          matchesDate = false;
        }
      }

      return matchesSearch && matchesSourceType && matchesDate;
    }).toList();

    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F5),
      body: SafeArea(
        child: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _loadSummary,
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // ── Header ──
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                        child: Row(
                          children: [
                            IconButton(
                              icon: const Icon(Icons.arrow_back_ios),
                              onPressed: _currentView == 0
                                  ? () => Navigator.pop(context)
                                  : () => setState(() => _currentView = 0),
                              padding: EdgeInsets.zero,
                              constraints: const BoxConstraints(),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              _currentView == 0 ? 'ย้อนกลับ' : _getPageTitle(),
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (hasError)
                        Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 8,
                          ),
                          child: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.red.shade50,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              'โหลดข้อมูลไม่สำเร็จ: ${_summary?['error']}',
                              style: const TextStyle(
                                color: Colors.red,
                                fontSize: 12,
                              ),
                            ),
                          ),
                        ),
                      // ── Total Points Card ──
                      Container(
                        margin: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                        padding: const EdgeInsets.all(24),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [
                              const Color(0xFFE3F2FD),
                              Colors.blue.shade100,
                            ],
                          ),
                          borderRadius: BorderRadius.circular(16),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.blue.withAlpha(26),
                              blurRadius: 8,
                              offset: const Offset(0, 2),
                            ),
                          ],
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'แต้มเพลินพอยท์',
                              style: TextStyle(
                                color: Colors.blue,
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 12),
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.baseline,
                              textBaseline: TextBaseline.alphabetic,
                              children: [
                                Text(
                                  totalPoints,
                                  style: const TextStyle(
                                    fontSize: 54,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.blue,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                const Text(
                                  'แต้ม',
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w500,
                                    color: Colors.blue,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      // ── Main Menu View ──
                      if (_currentView == 0) ...[
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
                          child: const Text(
                            'จัดการแต้มของคุณ',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        _buildMenuCard(
                          'แคมเปญ',
                          'ใช้แต้มแลกรับสิทธิประโยชน์',
                          Icons.card_giftcard,
                          () => setState(() => _currentView = 2),
                        ),
                        _buildMenuCard(
                          'ประวัติการแลกแต้ม',
                          'ตรวจสอบประวัติการแลกของคุณ',
                          Icons.history,
                          () => setState(() => _currentView = 1),
                        ),
                        _buildMenuCard(
                          'วิธีสะสมแต้ม',
                          'เรียนรู้วิธีสะสมแต้มเพิ่มขึ้น',
                          Icons.info_outline,
                          () => setState(() => _currentView = 3),
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
                          child: Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: const Color(0xFFE3F2FD),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: const Color(0xFFBBDEFB),
                              ),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.center,
                              children: [
                                const Text(
                                  'ต้องการความช่วยเหลือเรื่องแต้ม?',
                                  style: TextStyle(
                                    fontSize: 14,
                                    color: Colors.grey,
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                                const SizedBox(height: 12),
                                SizedBox(
                                  width: double.infinity,
                                  child: ElevatedButton(
                                    onPressed: () {},
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.blue,
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                    ),
                                    child: const Text(
                                      'ติดต่อเจ้าหน้าที่',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                      // ── Transaction History View ──
                      if (_currentView == 1) ...[
                        Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                          child: TextField(
                            onChanged: (value) {
                              setState(() => _searchQuery = value);
                            },
                            decoration: InputDecoration(
                              hintText: 'ค้นหารายการแลกแต้ม...',
                              hintStyle: TextStyle(color: Colors.grey.shade400),
                              prefixIcon: Icon(
                                Icons.search,
                                color: Colors.grey.shade400,
                              ),
                              filled: true,
                              fillColor: Colors.white,
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: BorderSide(
                                  color: Colors.grey.shade200,
                                ),
                              ),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: BorderSide(
                                  color: Colors.grey.shade200,
                                ),
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: BorderSide(
                                  color: Colors.blue.shade300,
                                ),
                              ),
                              contentPadding: const EdgeInsets.symmetric(
                                vertical: 12,
                              ),
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'ประเภทการรับแต้ม',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.grey,
                                ),
                              ),
                              const SizedBox(height: 8),
                              SingleChildScrollView(
                                scrollDirection: Axis.horizontal,
                                child: Row(
                                  children: [
                                    _buildTransactionTypeChip(
                                      'ทั้งหมด',
                                      _sourceTypeFilter.isEmpty,
                                      () => setState(
                                        () => _sourceTypeFilter = '',
                                      ),
                                      Icons.category,
                                    ),
                                    _buildTransactionTypeChip(
                                      'เช็คอินรายวัน',
                                      _sourceTypeFilter == 'daily_checkin',
                                      () => setState(
                                        () =>
                                            _sourceTypeFilter = 'daily_checkin',
                                      ),
                                      Icons.calendar_today,
                                    ),
                                    _buildTransactionTypeChip(
                                      'เวลาใช้งานแอพ',
                                      _sourceTypeFilter == 'app_time',
                                      () => setState(
                                        () => _sourceTypeFilter = 'app_time',
                                      ),
                                      Icons.timer,
                                    ),
                                    _buildTransactionTypeChip(
                                      'โบนัสสตรีค',
                                      _sourceTypeFilter.startsWith(
                                        'streak_bonus_',
                                      ),
                                      () => setState(
                                        () =>
                                            _sourceTypeFilter = 'streak_bonus_',
                                      ),
                                      Icons.local_fire_department,
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 16),
                              const Text(
                                'เลือกวันที่',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.grey,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  Expanded(
                                    child: OutlinedButton.icon(
                                      onPressed: () async {
                                        final picked = await showDatePicker(
                                          context: context,
                                          initialDate:
                                              _selectedHistoryDate ??
                                              DateTime.now(),
                                          firstDate: DateTime(2020),
                                          lastDate: DateTime.now(),
                                          builder: (context, child) {
                                            return Theme(
                                              data: Theme.of(context).copyWith(
                                                colorScheme: ColorScheme.light(
                                                  primary: Colors.blue,
                                                  onPrimary: Colors.white,
                                                  surface: Colors.white,
                                                  onSurface:
                                                      Colors.grey.shade800,
                                                ),
                                              ),
                                              child: child!,
                                            );
                                          },
                                        );
                                        if (picked != null) {
                                          setState(
                                            () => _selectedHistoryDate = picked,
                                          );
                                        }
                                      },
                                      icon: const Icon(
                                        Icons.calendar_today,
                                        size: 18,
                                      ),
                                      label: Text(
                                        _selectedHistoryDate == null
                                            ? 'เลือกวันที่'
                                            : 'วันที่ ${_selectedHistoryDate!.day}/${_selectedHistoryDate!.month}/${_selectedHistoryDate!.year}',
                                      ),
                                      style: OutlinedButton.styleFrom(
                                        foregroundColor:
                                            _selectedHistoryDate != null
                                            ? Colors.blue
                                            : Colors.grey.shade600,
                                        side: BorderSide(
                                          color: _selectedHistoryDate != null
                                              ? Colors.blue
                                              : Colors.grey.shade300,
                                          width: 1.5,
                                        ),
                                        shape: RoundedRectangleBorder(
                                          borderRadius: BorderRadius.circular(
                                            8,
                                          ),
                                        ),
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 12,
                                          vertical: 10,
                                        ),
                                      ),
                                    ),
                                  ),
                                  if (_selectedHistoryDate != null)
                                    Padding(
                                      padding: const EdgeInsets.only(left: 8),
                                      child: Container(
                                        decoration: BoxDecoration(
                                          color: Colors.red.shade50,
                                          borderRadius: BorderRadius.circular(
                                            8,
                                          ),
                                          border: Border.all(
                                            color: Colors.red.shade200,
                                          ),
                                        ),
                                        child: IconButton(
                                          onPressed: () => setState(
                                            () => _selectedHistoryDate = null,
                                          ),
                                          icon: Icon(
                                            Icons.close,
                                            size: 20,
                                            color: Colors.red.shade600,
                                          ),
                                          padding: EdgeInsets.zero,
                                          constraints: const BoxConstraints(
                                            minWidth: 40,
                                            minHeight: 40,
                                          ),
                                          tooltip: 'ล้างตัวกรองวันที่',
                                        ),
                                      ),
                                    ),
                                  if (_sourceTypeFilter.isNotEmpty)
                                    Padding(
                                      padding: const EdgeInsets.only(left: 8),
                                      child: Container(
                                        decoration: BoxDecoration(
                                          color: Colors.orange.shade50,
                                          borderRadius: BorderRadius.circular(
                                            8,
                                          ),
                                          border: Border.all(
                                            color: Colors.orange.shade200,
                                          ),
                                        ),
                                        child: IconButton(
                                          onPressed: () => setState(
                                            () => _sourceTypeFilter = '',
                                          ),
                                          icon: Icon(
                                            Icons.refresh,
                                            size: 20,
                                            color: Colors.orange.shade600,
                                          ),
                                          padding: EdgeInsets.zero,
                                          constraints: const BoxConstraints(
                                            minWidth: 40,
                                            minHeight: 40,
                                          ),
                                          tooltip: 'ล้างตัวกรองประเภท',
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                          child: const Text(
                            'รายการล่าสุด',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        if (filteredTx.isEmpty)
                          Container(
                            margin: const EdgeInsets.symmetric(horizontal: 16),
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Text(
                              'ยังไม่มีประวัติการแลกแต้ม',
                              style: TextStyle(color: Colors.grey),
                            ),
                          )
                        else
                          ...filteredTx.map((item) {
                            final itemMap = _convertToStringKeyMap(item);
                            final sourceType = (itemMap['source_type'] ?? '')
                                .toString();
                            final pointsValue =
                                (itemMap['points'] as num?)?.toDouble() ?? 0.0;
                            final absPoint = pointsValue.abs().toStringAsFixed(0);
                            final isRewardTx = sourceType.startsWith('reward_');
                            // Green if points > 0 and not a redemption source; red otherwise
                            final isPositive = !isRewardTx && pointsValue > 0;
                            final pointsDisplay = isPositive
                                ? '+$absPoint'
                                : '-$absPoint';
                            final pointColor = isPositive
                                ? Colors.green
                                : Colors.red;
                            final sourceLabel = _sourceLabel(
                              sourceType,
                              itemMap,
                            );

                            final txIcon = isRewardTx
                                ? Icons.card_giftcard
                                : sourceType == 'daily_checkin'
                                ? Icons.calendar_today
                                : sourceType == 'app_time'
                                ? Icons.timer
                                : sourceType.startsWith('streak_bonus_')
                                ? Icons.local_fire_department
                                : Icons.star;
                            final txIconColor = isRewardTx
                                ? Colors.purple
                                : sourceType == 'daily_checkin'
                                ? Colors.blue
                                : sourceType == 'app_time'
                                ? Colors.green
                                : sourceType.startsWith('streak_bonus_')
                                ? Colors.orange
                                : Colors.teal;

                            return Container(
                              margin: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 6,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(color: Colors.grey.shade100),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.grey.withAlpha(10),
                                    blurRadius: 4,
                                    offset: const Offset(0, 1),
                                  ),
                                ],
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Padding(
                                    padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
                                    child: Row(
                                      crossAxisAlignment: CrossAxisAlignment.center,
                                      children: [
                                        Container(
                                          width: 44,
                                          height: 44,
                                          decoration: BoxDecoration(
                                            color: txIconColor.withAlpha(26),
                                            borderRadius: BorderRadius.circular(10),
                                          ),
                                          child: Icon(txIcon, color: txIconColor, size: 22),
                                        ),
                                        const SizedBox(width: 12),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                sourceLabel,
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.w600,
                                                  fontSize: 14,
                                                ),
                                              ),
                                              const SizedBox(height: 2),
                                              Text(
                                                _formatDateTime(item['created_at']),
                                                style: TextStyle(
                                                  color: Colors.grey.shade500,
                                                  fontSize: 11,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                        Column(
                                          crossAxisAlignment: CrossAxisAlignment.end,
                                          children: [
                                            Text(
                                              '$pointsDisplay แต้ม',
                                              style: TextStyle(
                                                color: pointColor,
                                                fontWeight: FontWeight.bold,
                                                fontSize: 15,
                                              ),
                                            ),
                                            const SizedBox(height: 4),
                                            Container(
                                              padding: const EdgeInsets.symmetric(
                                                horizontal: 8,
                                                vertical: 2,
                                              ),
                                              decoration: BoxDecoration(
                                                color: isRewardTx
                                                    ? Colors.purple.withAlpha(20)
                                                    : Colors.green.shade50,
                                                borderRadius: BorderRadius.circular(4),
                                              ),
                                              child: Text(
                                                isRewardTx ? 'แลกรางวัล' : 'สำเร็จ',
                                                style: TextStyle(
                                                  color: isRewardTx
                                                      ? Colors.purple.shade700
                                                      : Colors.green,
                                                  fontSize: 10,
                                                  fontWeight: FontWeight.w500,
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                  if (isRewardTx) ...[
                                    Divider(height: 1, color: Colors.grey.shade100),
                                    Row(
                                      children: [
                                        Expanded(
                                          child: InkWell(
                                            onTap: () => _showRewardDetail(_convertToStringKeyMap(item)),
                                            borderRadius: const BorderRadius.only(bottomLeft: Radius.circular(14)),
                                            child: Padding(
                                              padding: const EdgeInsets.symmetric(vertical: 10),
                                              child: Row(
                                                mainAxisAlignment: MainAxisAlignment.center,
                                                children: [
                                                  Icon(Icons.qr_code_2, size: 14, color: Colors.blue.shade600),
                                                  const SizedBox(width: 6),
                                                  Text('ดูรายละเอียด / QR Code',
                                                    style: TextStyle(color: Colors.blue.shade600, fontWeight: FontWeight.w600, fontSize: 12)),
                                                ],
                                              ),
                                            ),
                                          ),
                                        ),
                                        Container(width: 1, height: 36, color: Colors.grey.shade100),
                                        Expanded(
                                          child: InkWell(
                                            onTap: () {
                                              final rd = _convertToStringKeyMap(item);
                                              final rdId = rd['redemption_id'];
                                              if (rdId != null) {
                                                _showReportCodeSheet(
                                                  redemptionId: rdId is int ? rdId : int.tryParse(rdId.toString()) ?? 0,
                                                  rewardName: (rd['reward_name'] ?? rd['name'] ?? 'รางวัล').toString(),
                                                );
                                              }
                                            },
                                            borderRadius: const BorderRadius.only(bottomRight: Radius.circular(14)),
                                            child: Padding(
                                              padding: const EdgeInsets.symmetric(vertical: 10),
                                              child: Row(
                                                mainAxisAlignment: MainAxisAlignment.center,
                                                children: [
                                                  Icon(Icons.report_problem_outlined, size: 14, color: Colors.orange.shade700),
                                                  const SizedBox(width: 6),
                                                  Text('แจ้งปัญหาโค้ด',
                                                    style: TextStyle(color: Colors.orange.shade700, fontWeight: FontWeight.w600, fontSize: 12)),
                                                ],
                                              ),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ],
                              ),
                            );
                          }),
                      ],
                      // ── Rewards Exchange View ──
                      if (_currentView == 2) ...[
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'ค้นหาแคมเปญ',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.grey,
                                ),
                              ),
                              const SizedBox(height: 8),
                              TextField(
                                onChanged: (value) =>
                                    setState(() => _searchQuery = value),
                                decoration: InputDecoration(
                                  hintText: 'ค้นหาชื่อแคมเปญ...',
                                  hintStyle: TextStyle(
                                    color: Colors.grey.shade400,
                                  ),
                                  prefixIcon: Icon(
                                    Icons.search,
                                    color: Colors.grey.shade400,
                                  ),
                                  suffixIcon: _searchQuery.isNotEmpty
                                      ? GestureDetector(
                                          onTap: () =>
                                              setState(() => _searchQuery = ''),
                                          child: Icon(
                                            Icons.close,
                                            color: Colors.grey.shade400,
                                          ),
                                        )
                                      : null,
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    borderSide: BorderSide(
                                      color: Colors.grey.shade200,
                                    ),
                                  ),
                                  enabledBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    borderSide: BorderSide(
                                      color: Colors.grey.shade200,
                                    ),
                                  ),
                                  focusedBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                    borderSide: const BorderSide(
                                      color: Colors.blue,
                                      width: 2,
                                    ),
                                  ),
                                  contentPadding: const EdgeInsets.symmetric(
                                    horizontal: 16,
                                    vertical: 12,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 8,
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'หมวดหมู่',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.grey,
                                ),
                              ),
                              const SizedBox(height: 8),
                              SingleChildScrollView(
                                scrollDirection: Axis.horizontal,
                                child: Row(
                                  children: [
                                    _buildRewardCategoryChip(
                                      'ทั้งหมด',
                                      _selectedRewardCategory.isEmpty,
                                      () => setState(
                                        () => _selectedRewardCategory = '',
                                      ),
                                      Icons.category,
                                    ),
                                    ..._getRewardCategories().map((category) {
                                      return _buildRewardCategoryChip(
                                        category,
                                        _selectedRewardCategory == category,
                                        () => setState(
                                          () => _selectedRewardCategory =
                                              category,
                                        ),
                                        _getCategoryIcon(category),
                                      );
                                    }),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (_availableRewards.isEmpty)
                          Container(
                            margin: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 24,
                            ),
                            padding: const EdgeInsets.all(24),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  Icons.card_giftcard,
                                  size: 48,
                                  color: Colors.grey.shade300,
                                ),
                                const SizedBox(height: 12),
                                const Text(
                                  'ยังไม่มีรางวัลให้แลก',
                                  style: TextStyle(
                                    color: Colors.grey,
                                    fontSize: 14,
                                  ),
                                ),
                              ],
                            ),
                          )
                        else
                          Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 12,
                            ),
                            child: Column(
                              children: _getFilteredRewards()
                                  .map<Widget>((reward) => Padding(
                                        padding:
                                            const EdgeInsets.only(bottom: 12.0),
                                        child: _buildRewardCard(
                                          reward,
                                          textScale: textScale,
                                        ),
                                      ))
                                  .toList(),
                            ),
                          ),
                      ],
                      // ── Earn Methods View ──
                      if (_currentView == 3) ...[
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                          child: Container(
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: Colors.grey.shade100),
                            ),
                            child: Column(
                              children: [
                                _buildEarnMethodItem(
                                  Icons.calendar_today,
                                  'เช็คอินรายวัน',
                                  'เข้ามาเช็คอินทุกวันเพื่อรับแต้มประจำวัน',
                                  const Color(0xFF42A5F5),
                                ),
                                Divider(height: 1, indent: 58),
                                _buildEarnMethodItem(
                                  Icons.timer,
                                  'เวลาใช้งานแอพ',
                                  _buildSessionMethodText(),
                                  const Color(0xFF66BB6A),
                                ),
                                Divider(height: 1, indent: 58),
                                _buildEarnMethodItem(
                                  Icons.local_fire_department,
                                  'โบนัสต่อเนื่อง',
                                  'รักษาการเช็คอินต่อเนื่อง รับโบนัสแต้มเพิ่มเติม',
                                  const Color(0xFFFF7043),
                                ),
                                Divider(height: 1, indent: 58),
                                _buildEarnMethodItem(
                                  Icons.card_giftcard,
                                  'กิจกรรมพิเศษ',
                                  'เข้าร่วมกิจกรรมและเหตุการณ์พิเศษได้แต้มเพิ่มเติม',
                                  const Color(0xFFAB47BC),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 20),
                    ],
                  ),
                ),
              ),
      ),
    );
  }

  String _getPageTitle() {
    switch (_currentView) {
      case 1:
        return 'ประวัติการแลกแต้ม';
      case 2:
        return 'แคมเปญ';
      case 3:
        return 'วิธีสะสมแต้ม';
      default:
        return 'ย้อนกลับ';
    }
  }

  Widget _buildMenuCard(
    String title,
    String subtitle,
    IconData icon,
    VoidCallback onTap,
  ) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey.shade100),
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: Colors.blue, size: 24),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: Colors.grey.shade400),
          ],
        ),
      ),
    );
  }

  Widget _buildTransactionTypeChip(
    String label,
    bool isSelected,
    VoidCallback onTap,
    IconData icon,
  ) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? Colors.blue.shade50 : Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isSelected ? Colors.blue : Colors.grey.shade200,
            width: 1.5,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 16,
              color: isSelected ? Colors.blue : Colors.grey.shade600,
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                color: isSelected ? Colors.blue : Colors.grey.shade600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _buildSessionMethodText() {
    final threshold = (_rewardSettings?['session_bonus_threshold'] as num?)?.toInt() ?? 40;
    final points = (_rewardSettings?['session_bonus_points'] as num?)?.toInt() ?? 8;
    final dailyLimit = (_rewardSettings?['usage_reward_daily_limit_count'] as num?)?.toInt() ?? 2;
    final maxPoints = points * dailyLimit;
    return 'ใช้แอพแต่ละ $threshold นาที ได้ $points แต้ม (สูงสุด $maxPoints แต้มต่อวัน)';
  }

  Widget _buildEarnMethodItem(
    IconData icon,
    String title,
    String description,
    Color color,
  ) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: color.withAlpha(26),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: color, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: Colors.black87,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  description,
                  style: const TextStyle(
                    fontSize: 12,
                    color: Colors.grey,
                    height: 1.4,
                  ),
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  List<String> _getRewardCategories() {
    final categories = <String>{};
    for (final reward in _availableRewards) {
      final category = (reward['category'] ?? '').toString();
      if (category.isNotEmpty) {
        categories.add(category);
      }
    }
    return categories.toList();
  }

  List<dynamic> _getFilteredRewards() {
    var filtered = _availableRewards;

    if (_selectedRewardCategory.isNotEmpty) {
      filtered = filtered
          .where(
            (reward) =>
                (reward['category'] ?? '').toString() ==
                _selectedRewardCategory,
          )
          .toList();
    }

    if (_searchQuery.isNotEmpty) {
      final query = _searchQuery.toLowerCase();
      filtered = filtered.where((reward) {
        final name = (reward['name'] ?? '').toString().toLowerCase();
        final description = (reward['description'] ?? '')
            .toString()
            .toLowerCase();
        return name.contains(query) || description.contains(query);
      }).toList();
    }

    return filtered;
  }

  Widget _buildRewardCategoryChip(
    String label,
    bool isSelected,
    VoidCallback onTap,
    IconData icon,
  ) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? Colors.blue.shade50 : Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isSelected ? Colors.blue : Colors.grey.shade200,
            width: 1.5,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 16,
              color: isSelected ? Colors.blue : Colors.grey.shade600,
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                color: isSelected ? Colors.blue : Colors.grey.shade600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  IconData _getCategoryIcon(String category) {
    final cat = category.toLowerCase();
    if (cat.contains('อาหาร') || cat.contains('food')) return Icons.restaurant;
    if (cat.contains('เครื่องดื่ม') || cat.contains('drink'))
      return Icons.local_cafe;
    if (cat.contains('ของขวัญ') || cat.contains('gift'))
      return Icons.card_giftcard;
    if (cat.contains('บัตร') || cat.contains('card')) return Icons.credit_card;
    if (cat.contains('ส่วนลด') || cat.contains('discount'))
      return Icons.local_offer;
    if (cat.contains('ท้องเที่ยว') || cat.contains('travel'))
      return Icons.flight;
    if (cat.contains('ความงาม') || cat.contains('beauty')) return Icons.spa;
    if (cat.contains('เกม') || cat.contains('game'))
      return Icons.sports_esports;
    if (cat.contains('หนังสือ') || cat.contains('book')) return Icons.menu_book;
    return Icons.star;
  }

  String _resolveRewardImageUrl(String imageUrl) {
    final trimmed = imageUrl.toString().trim();
    if (trimmed.isEmpty) return '';
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    final normalized = trimmed.replaceFirst(RegExp(r'^/+'), '');
    if (normalized.startsWith('uploads/')) {
      return '${AppConfig.serverBaseUrl}/$normalized';
    }
    return '${AppConfig.serverBaseUrl}/uploads/$normalized';
  }

  double _getRewardCardExtent(double textScale) {
    final extraHeight = ((textScale - 1.0) * 84.0).clamp(0.0, 120.0);
    return 380.0 + extraHeight;
  }

  Widget _buildRewardCard(dynamic reward, {double textScale = 1.0}) {
    final name = (reward['name'] ?? 'รางวัล').toString();
    final cost = (reward['points_required'] ?? 0).toInt();
    final imageUrl = _resolveRewardImageUrl(
      (reward['image_url'] ?? '').toString(),
    );
    final description = _clean((reward['description'] ?? '').toString());
    final totalPoints = (_summary?['total_points'] ?? 0).toInt();
    // Validity dates
    final rawStart = reward['start_date'] ?? reward['valid_from'] ?? reward['campaign_start_date'];
    final rawEnd = reward['end_date'] ?? reward['expires_at'] ?? reward['valid_to'] ?? reward['campaign_end_date'];
    final parsedStart = _parseToDateTime(rawStart);
    final parsedEnd = _parseToDateTime(rawEnd);
    final now = DateTime.now();
    final isExpired = parsedEnd != null && parsedEnd.isBefore(now);
    final daysLeft = parsedEnd != null && !isExpired
        ? parsedEnd.difference(now).inDays
        : null;
    final canRedeem = totalPoints >= cost && !isExpired;
    final nameMaxLines = textScale > 1.3 ? 3 : 2;
    final descriptionMaxLines = textScale > 1.15 ? 2 : 1;
    // โลโก้พาร์ทเนอร์ไม่ได้ออกแบบมาให้ครอปเต็มกรอบเหมือนภาพถ่ายสินค้า
    // ให้แสดงแบบ contain ลอยกลางบนพื้นขาวแทนการ cover ให้ล้นขอบ
    final isPartnerLogo = imageUrl.contains('/partners/');

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade100),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withAlpha(13),
            blurRadius: 4,
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Image Section
          SizedBox(
            height: 180,
            child: ClipRRect(
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
              ),
              child: Stack(
                children: [
                  Positioned.fill(
                    child: Container(
                      color: isPartnerLogo ? Colors.white : Colors.grey.shade100,
                      padding: isPartnerLogo
                          ? const EdgeInsets.symmetric(horizontal: 28, vertical: 20)
                          : EdgeInsets.zero,
                      child: imageUrl.isNotEmpty
                          ? Image.network(
                              imageUrl,
                              fit: isPartnerLogo ? BoxFit.contain : BoxFit.cover,
                              width: double.infinity,
                              height: double.infinity,
                              loadingBuilder: (context, child, loadingProgress) {
                                if (loadingProgress == null) return child;
                                return const Center(
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                );
                              },
                              errorBuilder: (context, error, stackTrace) {
                                return Center(
                                  child: Icon(
                                    Icons.broken_image,
                                    size: 40,
                                    color: Colors.grey.shade400,
                                  ),
                                );
                              },
                            )
                          : Center(
                              child: Icon(
                                Icons.card_giftcard,
                                size: 40,
                                color: Colors.grey.shade400,
                              ),
                            ),
                    ),
                  ),
                  Positioned(
                    top: 12,
                    right: 12,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFA500),
                        borderRadius: BorderRadius.circular(999),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withAlpha(30),
                            blurRadius: 6,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Text(
                        '$cost แต้ม',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          // Info Section
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if ((reward['category'] ?? '').toString().isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.blue.shade50,
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(
                          color: Colors.blue.shade200,
                          width: 0.5,
                        ),
                      ),
                      child: Text(
                        (reward['category'] ?? '').toString(),
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w500,
                          color: Colors.blue.shade700,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                Text(
                  name,
                  maxLines: nameMaxLines,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (description.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      description,
                      maxLines: descriptionMaxLines,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ),
                if (parsedStart != null || parsedEnd != null) ...[
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Icon(Icons.calendar_today, size: 11, color: Colors.grey.shade500),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          [
                            if (parsedStart != null) 'เริ่ม ${_formatDateTimeForDetail(parsedStart)}',
                            if (parsedEnd != null) 'ถึง ${_formatDateTimeForDetail(parsedEnd)}',
                          ].join('  '),
                          style: TextStyle(fontSize: 10, color: Colors.grey.shade500),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (isExpired)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: Colors.red.shade100,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text('หมดอายุ', style: TextStyle(fontSize: 10, color: Colors.red.shade700, fontWeight: FontWeight.bold)),
                        )
                      else if (daysLeft != null && daysLeft <= 7)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: Colors.orange.shade100,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text('เหลือ $daysLeft วัน', style: TextStyle(fontSize: 10, color: Colors.orange.shade800, fontWeight: FontWeight.bold)),
                        ),
                    ],
                  ),
                ],
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: canRedeem
                        ? () => _showRedeemConfirmation(reward)
                        : null,
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size.fromHeight(40),
                      backgroundColor: canRedeem
                          ? Colors.blue
                          : Colors.grey.shade300,
                      disabledBackgroundColor: Colors.grey.shade300,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(6),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 8),
                    ),
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        isExpired
                            ? 'หมดอายุแล้ว'
                            : canRedeem
                            ? 'แลกรับ'
                            : 'แต้มไม่พอ',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: canRedeem
                              ? Colors.white
                              : Colors.grey.shade600,
                        ),
                      ),
                    ),
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

// ==========================================
// Transaction QR Detail Dialog
// ==========================================
class _TransactionQRDetailDialog extends StatefulWidget {
  final Map<String, dynamic> transaction;

  const _TransactionQRDetailDialog({required this.transaction});

  @override
  State<_TransactionQRDetailDialog> createState() =>
      _TransactionQRDetailDialogState();
}

class _TransactionQRDetailDialogState
    extends State<_TransactionQRDetailDialog> {
  late Timer? _timer;
  late int _remainingSeconds;
  late Future<Map<String, dynamic>> _redemptionDataFuture;
  dynamic _effectiveExpiresAt;

  @override
  void initState() {
    super.initState();
    _effectiveExpiresAt = widget.transaction['expires_at'];
    _updateRemainingTime();
    _startCountdown();
    _redemptionDataFuture = _fetchRedemptionData();
  }

  Future<Map<String, dynamic>> _fetchRedemptionData() async {
    try {
      final qrCode = widget.transaction['qr_code'] ?? '';
      final phoneNumber = widget.transaction['phone_number'] ?? '';

      if (qrCode.isEmpty || phoneNumber.isEmpty) {
        return widget.transaction;
      }

      final response = await RewardService.getRedemptionRecord(
        phoneNumber,
        qrCode,
      );
      if (response.isNotEmpty) {
        final merged = {...widget.transaction, ...response};
        _effectiveExpiresAt = merged['expires_at'];
        return merged;
      }
      return widget.transaction;
    } catch (e) {
      debugPrint('Error fetching redemption data: $e');
      return widget.transaction;
    }
  }

  void _updateRemainingTime() {
    try {
      final expiresAt = _effectiveExpiresAt ?? widget.transaction['expires_at'];
      _remainingSeconds = _calculateRemainingSeconds(expiresAt);
    } catch (_) {
      _remainingSeconds = 3600;
    }
  }

  int _calculateRemainingSeconds(dynamic expiresAt) {
    if (expiresAt == null) {
      return 3600;
    }

    try {
      final DateTime expiryDate;
      if (expiresAt is num) {
        final ms = expiresAt > 10000000000
            ? expiresAt.toInt()
            : (expiresAt.toInt() * 1000);
        expiryDate = DateTime.fromMillisecondsSinceEpoch(ms).toLocal();
      } else {
        expiryDate = DateTime.parse(expiresAt.toString()).toLocal();
      }

      final seconds = expiryDate.difference(DateTime.now()).inSeconds;
      return seconds < 0 ? 0 : seconds;
    } catch (_) {
      return 3600;
    }
  }

  void _startCountdown() {
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) {
        setState(() {
          _updateRemainingTime();
        });
      }
    });
  }

  String _formatTime(int seconds) {
    if (seconds <= 0) return '00:00';
    final days = seconds ~/ 86400;
    final hours = (seconds % 86400) ~/ 3600;
    final minutes = (seconds % 3600) ~/ 60;
    final secs = seconds % 60;
    if (days > 0)
      return '${days} วัน ${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}';
    if (hours > 0)
      return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
    return '${minutes.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
  }

  String _getStatusLabel(String status) {
    switch (status) {
      case 'used':
        return 'ใช้แล้ว';
      case 'pending':
        return 'รอดำเนินการ';
      case 'cancelled':
        return 'ยกเลิก';
      case 'expired':
        return 'หมดอายุ';
      default:
        return status;
    }
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'used':
        return Colors.green;
      case 'pending':
        return Colors.orange;
      case 'cancelled':
        return Colors.red;
      case 'expired':
        return Colors.grey;
      default:
        return Colors.blue;
    }
  }

  String _getStatusIcon(String status) {
    switch (status) {
      case 'used':
        return '✓';
      case 'pending':
        return '⏳';
      case 'cancelled':
        return '✕';
      case 'expired':
        return '⏰';
      default:
        return '?';
    }
  }

  String _formatCountdownVerbose(int seconds) {
    final hours = seconds ~/ 3600;
    final minutes = (seconds % 3600) ~/ 60;
    final secs = seconds % 60;

    if (hours > 0) {
      return '$hours ชั่วโมง $minutes นาที';
    } else if (minutes > 0) {
      return '$minutes นาที $secs วินาที';
    } else {
      return '$secs วินาที';
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, dynamic>>(
      future: _redemptionDataFuture,
      builder: (context, snapshot) {
        final data = snapshot.data ?? widget.transaction;
        final expiresAt = data['expires_at'] ?? _effectiveExpiresAt;
        final remainingSeconds = _calculateRemainingSeconds(expiresAt);
        final qrCode = data['qr_code'] ?? '';
        final rewardName =
            data['reward_name'] ??
            data['name'] ??
            data['source_type'] ??
            'รางวัล';
        final status =
            (data['redemption_status'] ?? data['status'] ?? 'pending')
                .toString();
        final pointsUsed = data['points_redeemed'] ?? data['points'] ?? 0;
        final createdAt = data['created_at'] ?? data['redeemed_at'];
        final usedAt = data['used_at'];
        final redemptionId = data['redemption_id'] ?? '';

        if (expiresAt != null && expiresAt != _effectiveExpiresAt) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (!mounted) return;
            setState(() {
              _effectiveExpiresAt = expiresAt;
              _updateRemainingTime();
            });
          });
        }

        return Dialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade100,
                    borderRadius: const BorderRadius.only(
                      topLeft: Radius.circular(16),
                      topRight: Radius.circular(16),
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      GestureDetector(
                        onTap: () => Navigator.pop(context),
                        child: const Icon(Icons.arrow_back, size: 24),
                      ),
                      Expanded(
                        child: Text(
                          rewardName,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 24),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                        decoration: BoxDecoration(
                          color: _getStatusColor(status).withAlpha(26),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: _getStatusColor(status).withAlpha(128),
                          ),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              _getStatusIcon(status),
                              style: TextStyle(
                                fontSize: 18,
                                color: _getStatusColor(status),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              _getStatusLabel(status),
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: _getStatusColor(status),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),

                      if (expiresAt != null)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                          decoration: BoxDecoration(
                            color: remainingSeconds <= 300
                                ? Colors.red.shade50
                                : Colors.green.shade50,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: _remainingSeconds <= 300
                                  ? Colors.red.shade200
                                  : Colors.blue.shade200,
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'หมดอายุใน',
                                style: TextStyle(
                                  fontWeight: FontWeight.w500,
                                  fontSize: 12,
                                  color: Colors.grey.shade700,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(
                                    child: Text(
                                      _formatCountdownVerbose(remainingSeconds),
                                      style: TextStyle(
                                        fontWeight: FontWeight.bold,
                                        fontSize: 16,
                                        color: remainingSeconds <= 300
                                            ? Colors.red.shade700
                                            : Colors.green.shade700,
                                      ),
                                    ),
                                  ),
                                  Text(
                                    _formatTime(remainingSeconds),
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 14,
                                      color: remainingSeconds <= 300
                                          ? Colors.red.shade700
                                          : Colors.green.shade700,
                                      fontFamily: 'monospace',
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),

                      const SizedBox(height: 20),

                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.grey.shade200),
                        ),
                        child: Column(
                          children: [
                            if (qrCode.isNotEmpty)
                              Container(
                                height: 180,
                                width: 180,
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(
                                    color: Colors.grey.shade200,
                                  ),
                                ),
                                child: QrImageView(
                                  data: qrCode,
                                  version: QrVersions.auto,
                                  size: 164,
                                  backgroundColor: Colors.white,
                                  foregroundColor: Colors.black,
                                ),
                              )
                            else
                              Container(
                                height: 180,
                                width: 180,
                                decoration: BoxDecoration(
                                  color: Colors.grey.shade100,
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(
                                    color: Colors.grey.shade300,
                                  ),
                                ),
                                child: Center(
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(
                                        Icons.qr_code_2,
                                        size: 48,
                                        color: Colors.grey.shade400,
                                      ),
                                      const SizedBox(height: 8),
                                      Text(
                                        'ไม่มี QR Code',
                                        style: TextStyle(
                                          color: Colors.grey.shade600,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            const SizedBox(height: 12),
                            if (qrCode.isNotEmpty)
                              GestureDetector(
                                onTap: () {
                                  Clipboard.setData(
                                    ClipboardData(text: qrCode),
                                  );
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('คัดลอก QR code เรียบร้อย'),
                                      duration: Duration(seconds: 2),
                                    ),
                                  );
                                },
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 8,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Colors.grey.shade50,
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(
                                      color: Colors.grey.shade300,
                                    ),
                                  ),
                                  child: Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          qrCode,
                                          style: const TextStyle(
                                            fontSize: 11,
                                            fontFamily: 'monospace',
                                            color: Colors.black87,
                                          ),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Icon(
                                        Icons.copy,
                                        size: 16,
                                        color: Colors.grey.shade600,
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 20),

                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade50,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.grey.shade200),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (rewardName.isNotEmpty &&
                                rewardName != 'รางวัล') ...[
                              _detailRow('รางวัล:', rewardName),
                              const Divider(height: 12),
                            ],
                            _detailRow(
                              'แต้มที่ใช้:',
                              '${(pointsUsed as dynamic).abs()} แต้ม',
                            ),
                            const Divider(height: 12),
                            if (redemptionId.isNotEmpty) ...[
                              _detailRow('ID:', redemptionId),
                              const Divider(height: 12),
                            ],
                            _detailRow(
                              'วันแลก:',
                              createdAt != null
                                  ? _formatDateTime(createdAt)
                                  : '-',
                            ),
                            if (expiresAt != null) ...[
                              const Divider(height: 12),
                              _detailRow(
                                'วันหมดอายุ:',
                                _formatDateTime(expiresAt),
                              ),
                            ],
                            if (usedAt != null) ...[
                              const Divider(height: 12),
                              _detailRow('วันที่ใช้:', _formatDateTime(usedAt)),
                            ],
                            if ((data['usage_instructions'] ?? '')
                                .toString()
                                .isNotEmpty) ...[
                              const Divider(height: 12),
                              _detailRow(
                                'เงื่อนไขการใช้:',
                                data['usage_instructions'].toString(),
                              ),
                            ],
                          ],
                        ),
                      ),

                      const SizedBox(height: 20),

                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: () => Navigator.pop(context),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.blue,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: const Text(
                            'ปิด',
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                              fontSize: 14,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _detailRow(String label, String value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 12,
            color: Colors.grey,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: Colors.black87,
            ),
          ),
        ),
      ],
    );
  }

  String _formatDateTime(dynamic value) {
    if (value == null) return '-';
    try {
      final raw = value.toString();
      final utcStr = raw.endsWith('Z') || raw.contains('+') ? raw : '${raw}Z';
      final dt = DateTime.parse(utcStr).add(const Duration(hours: 7));
      final hh = dt.hour.toString().padLeft(2, '0');
      final mm = dt.minute.toString().padLeft(2, '0');
      final dd = dt.day.toString().padLeft(2, '0');
      final mo = dt.month.toString().padLeft(2, '0');
      return '$dd/$mo/${dt.year} $hh:$mm';
    } catch (_) {
      return value.toString();
    }
  }
}

// ==========================================
// QR Code Redemption Dialog
// ==========================================
class _QRCodeRedemptionDialog extends StatefulWidget {
  final dynamic reward;
  final String qrCode;
  final dynamic expiresAt;
  final String phoneNumber;
  final dynamic originalReward;
  final String? promoCode;
  final String? promoCodeDescription;
  final String? promoCodeExpiry;

  const _QRCodeRedemptionDialog({
    required this.reward,
    required this.qrCode,
    required this.expiresAt,
    required this.phoneNumber,
    required this.originalReward,
    this.promoCode,
    this.promoCodeDescription,
    this.promoCodeExpiry,
  });

  @override
  State<_QRCodeRedemptionDialog> createState() =>
      _QRCodeRedemptionDialogState();
}

class _QRCodeRedemptionDialogState extends State<_QRCodeRedemptionDialog> {
  Timer? _timer;
  late int _remainingSeconds;
  String _selectedMethod = 'qr_code';

  @override
  void initState() {
    super.initState();
    _updateRemainingTime();
    _startCountdown();
  }

  void _updateRemainingTime() {
    try {
      if (widget.expiresAt == null) {
        _remainingSeconds = 3600;
        return;
      }
      final expiresAt = widget.expiresAt;
      final DateTime dt;
      if (expiresAt is num) {
        final ms = expiresAt > 10000000000
            ? expiresAt.toInt()
            : (expiresAt.toInt() * 1000);
        dt = DateTime.fromMillisecondsSinceEpoch(ms).toLocal();
      } else {
        // normalize MySQL DATETIME → UTC ISO แล้ว toLocal()
        final s = expiresAt.toString();
        final normalized = s.contains('T') ? s : s.replaceFirst(' ', 'T');
        final isoStr = (normalized.endsWith('Z') || normalized.contains('+'))
            ? normalized
            : '${normalized}Z';
        dt = DateTime.parse(isoStr).toLocal();
      }
      final secs = dt.difference(DateTime.now()).inSeconds;
      _remainingSeconds = secs < 0 ? 0 : secs;
    } catch (_) {
      _remainingSeconds = 3600;
    }
  }

  void _startCountdown() {
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) {
        setState(() {
          _updateRemainingTime();
        });
      }
    });
  }

  String _formatTime(int seconds) {
    if (seconds <= 0) return 'หมดอายุ';
    final days = seconds ~/ 86400;
    final hours = (seconds % 86400) ~/ 3600;
    final minutes = (seconds % 3600) ~/ 60;
    final secs = seconds % 60;
    if (days > 0)
      return '${days} วัน ${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}';
    if (hours > 0)
      return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
    return '${minutes.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
  }

  String _formatCountdownVerbose(int seconds) {
    final hours = seconds ~/ 3600;
    final minutes = (seconds % 3600) ~/ 60;
    final secs = seconds % 60;

    if (hours > 0) {
      return '$hours ชั่วโมง $minutes นาที';
    } else if (minutes > 0) {
      return '$minutes นาที $secs วินาที';
    } else {
      return '$secs วินาที';
    }
  }

  String _formatExpiryDate(dynamic value) {
    if (value == null) return '-';
    try {
      final raw = value.toString();
      final utcStr = raw.endsWith('Z') || raw.contains('+') ? raw : '${raw}Z';
      final dt = DateTime.parse(utcStr).add(const Duration(hours: 7));
      final dd = dt.day.toString().padLeft(2, '0');
      final mo = dt.month.toString().padLeft(2, '0');
      final hh = dt.hour.toString().padLeft(2, '0');
      final mm = dt.minute.toString().padLeft(2, '0');
      return '$dd/$mo/${dt.year} $hh:$mm';
    } catch (_) {
      return value.toString();
    }
  }

  Widget _detailRow(String label, String value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            color: Colors.grey.shade600,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            value,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: Colors.black87,
            ),
            textAlign: TextAlign.end,
          ),
        ),
      ],
    );
  }

  Widget _buildQRCodeDisplay() {
    if (widget.qrCode.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.qr_code_2, size: 60, color: Colors.grey.shade300),
            const SizedBox(height: 8),
            Text(
              'ไม่มี QR Code',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
            ),
          ],
        ),
      );
    }

    final isExpired = _remainingSeconds <= 0;

    return Stack(
      alignment: Alignment.center,
      children: [
        Opacity(
          opacity: isExpired ? 0.4 : 1.0,
          child: QrImageView(
            data: widget.qrCode,
            version: QrVersions.auto,
            size: 144,
            backgroundColor: Colors.white,
            foregroundColor: Colors.black,
          ),
        ),
        if (isExpired)
          Container(
            width: 144,
            height: 144,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              color: Colors.red.shade600.withAlpha(51),
            ),
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    '❌',
                    style: TextStyle(fontSize: 32, color: Colors.red.shade700),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'EXPIRED',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: Colors.red.shade700,
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(16),
                  topRight: Radius.circular(16),
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  GestureDetector(
                    onTap: () => Navigator.pop(context),
                    child: const Icon(Icons.arrow_back, size: 24),
                  ),
                  const Text(
                    'ข้อมูลรางวัล',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(width: 24),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: widget.expiresAt == null
                          ? Colors.green.shade50
                          : _remainingSeconds <= 300
                          ? Colors.red.shade50
                          : Colors.orange.shade50,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: widget.expiresAt == null
                            ? Colors.green.shade200
                            : _remainingSeconds <= 300
                            ? Colors.red.shade200
                            : Colors.orange.shade200,
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Icon(
                              widget.expiresAt == null
                                  ? Icons.all_inclusive
                                  : _remainingSeconds <= 0
                                  ? Icons.timer_off
                                  : Icons.timer_outlined,
                              size: 16,
                              color: widget.expiresAt == null
                                  ? Colors.green.shade600
                                  : _remainingSeconds <= 300
                                  ? Colors.red.shade600
                                  : Colors.orange.shade600,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              'หมดอายุภายใน',
                              style: TextStyle(
                                fontWeight: FontWeight.w500,
                                fontSize: 13,
                                color: Colors.grey.shade700,
                              ),
                            ),
                          ],
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              widget.expiresAt == null
                                  ? 'ไม่มีกำหนด'
                                  : _formatTime(_remainingSeconds),
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 15,
                                color: widget.expiresAt == null
                                    ? Colors.green.shade600
                                    : _remainingSeconds <= 0
                                    ? Colors.red.shade700
                                    : _remainingSeconds <= 300
                                    ? Colors.red.shade600
                                    : Colors.orange.shade700,
                              ),
                            ),
                            if (widget.expiresAt != null &&
                                _remainingSeconds > 0 &&
                                _remainingSeconds <= 300)
                              Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: Text(
                                  '⚠️ ใกล้หมดอายุ',
                                  style: TextStyle(
                                    fontSize: 10,
                                    color: Colors.red.shade600,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade50,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.grey.shade200),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'เลือกวิธีแลกรางวัล',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: Colors.grey.shade800,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: GestureDetector(
                                onTap: () =>
                                    setState(() => _selectedMethod = 'qr_code'),
                                child: Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: _selectedMethod == 'qr_code'
                                        ? Colors.blue.shade100
                                        : Colors.white,
                                    border: Border.all(
                                      color: _selectedMethod == 'qr_code'
                                          ? Colors.blue.shade500
                                          : Colors.grey.shade300,
                                      width: _selectedMethod == 'qr_code'
                                          ? 2
                                          : 1,
                                    ),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Column(
                                    children: [
                                      Icon(
                                        Icons.qr_code_2,
                                        color: _selectedMethod == 'qr_code'
                                            ? Colors.blue.shade700
                                            : Colors.grey.shade600,
                                        size: 24,
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        'QR Code',
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.bold,
                                          color: _selectedMethod == 'qr_code'
                                              ? Colors.blue.shade700
                                              : Colors.grey.shade600,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: GestureDetector(
                                onTap: () =>
                                    setState(() => _selectedMethod = 'barcode'),
                                child: Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: _selectedMethod == 'barcode'
                                        ? Colors.blue.shade100
                                        : Colors.white,
                                    border: Border.all(
                                      color: _selectedMethod == 'barcode'
                                          ? Colors.blue.shade500
                                          : Colors.grey.shade300,
                                      width: _selectedMethod == 'barcode'
                                          ? 2
                                          : 1,
                                    ),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Column(
                                    children: [
                                      Icon(
                                        Icons.barcode_reader,
                                        color: _selectedMethod == 'barcode'
                                            ? Colors.blue.shade700
                                            : Colors.grey.shade600,
                                        size: 24,
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        'Barcode',
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.bold,
                                          color: _selectedMethod == 'barcode'
                                              ? Colors.blue.shade700
                                              : Colors.grey.shade600,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: GestureDetector(
                                onTap: () =>
                                    setState(() => _selectedMethod = 'code'),
                                child: Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: _selectedMethod == 'code'
                                        ? Colors.blue.shade100
                                        : Colors.white,
                                    border: Border.all(
                                      color: _selectedMethod == 'code'
                                          ? Colors.blue.shade500
                                          : Colors.grey.shade300,
                                      width: _selectedMethod == 'code' ? 2 : 1,
                                    ),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Column(
                                    children: [
                                      Icon(
                                        Icons.confirmation_number,
                                        color: _selectedMethod == 'code'
                                            ? Colors.blue.shade700
                                            : Colors.grey.shade600,
                                        size: 24,
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        'Code',
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.bold,
                                          color: _selectedMethod == 'code'
                                              ? Colors.blue.shade700
                                              : Colors.grey.shade600,
                                        ),
                                      ),
                                      if (widget.promoCode != null) ...[
                                        const SizedBox(height: 2),
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 5,
                                            vertical: 1,
                                          ),
                                          decoration: BoxDecoration(
                                            color: Colors.blue.shade500,
                                            borderRadius: BorderRadius.circular(
                                              8,
                                            ),
                                          ),
                                          child: const Text(
                                            'NEW',
                                            style: TextStyle(
                                              fontSize: 8,
                                              color: Colors.white,
                                              fontWeight: FontWeight.bold,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.grey.shade200),
                    ),
                    child: Column(
                      children: [
                        if (_selectedMethod == 'qr_code') ...[
                          Text(
                            'สแกน QR Code นี้',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Container(
                            height: 160,
                            width: 160,
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: Colors.grey.shade200),
                            ),
                            child: _buildQRCodeDisplay(),
                          ),
                        ] else if (_selectedMethod == 'barcode') ...[
                          Text(
                            'สแกน Barcode นี้',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Container(
                            height: 110,
                            width: double.infinity,
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: Colors.grey.shade200),
                            ),
                            child: widget.qrCode.isEmpty
                                ? Center(
                                    child: Text(
                                      'ไม่มี Barcode',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: Colors.grey.shade500,
                                      ),
                                    ),
                                  )
                                : Opacity(
                                  opacity: _remainingSeconds <= 0 ? 0.4 : 1.0,
                                    child: BarcodeWidget(
                                      barcode: Barcode.code128(),
                                      data: widget.qrCode,
                                      style: TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.bold,
                                      ),
                                      drawText: true,
                                      textPadding: 8,
                                      errorBuilder: (context, error) {
                                        return Center(
                                          child: Text(
                                            'ไม่สามารถสร้าง Barcode',
                                            style: TextStyle(
                                              fontSize: 12,
                                              color: Colors.red,
                                            ),
                                          ),
                                        );
                                      },
                                    ),
                                  ),
                          ),
                        ] else if (_selectedMethod == 'code') ...[
                          if (widget.promoCode != null) ...[
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 6,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.blue.shade50,
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(
                                  color: Colors.blue.shade300,
                                ),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.local_offer_rounded,
                                    size: 14,
                                    color: Colors.blue.shade700,
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    'โค้ดส่วนลดพิเศษ',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                      color: Colors.blue.shade700,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 12),
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(
                                vertical: 16,
                                horizontal: 12,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.blue.shade50,
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: Colors.blue.shade300,
                                  width: 2,
                                ),
                              ),
                              child: Column(
                                children: [
                                  SelectableText(
                                    widget.promoCode!,
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      fontSize: 22,
                                      fontWeight: FontWeight.bold,
                                      fontFamily: 'monospace',
                                      letterSpacing: 2,
                                      color: Colors.black87,
                                    ),
                                  ),
                                  if (widget.promoCodeDescription != null &&
                                      widget.promoCodeDescription!.isNotEmpty) ...[
                                    const SizedBox(height: 6),
                                    Text(
                                      widget.promoCodeDescription!,
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: Colors.grey.shade600,
                                      ),
                                    ),
                                  ],
                                  if (widget.promoCodeExpiry != null &&
                                      widget.promoCodeExpiry!.isNotEmpty) ...[
                                    const SizedBox(height: 4),
                                    Text(
                                      'หมดอายุ: ${widget.promoCodeExpiry}',
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: Colors.orange.shade700,
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                            const SizedBox(height: 10),
                            GestureDetector(
                              onTap: () async {
                                await Clipboard.setData(
                                  ClipboardData(text: widget.promoCode!),
                                );
                                if (mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('คัดลอกโค้ดสำเร็จ ✓'),
                                    ),
                                  );
                                }
                              },
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 24,
                                  vertical: 10,
                                ),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF1565C0),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      Icons.copy,
                                      color: Colors.white,
                                      size: 16,
                                    ),
                                    SizedBox(width: 6),
                                    Text(
                                      'คัดลอกโค้ด',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 14,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ] else ...[
                            Text(
                              'ใช้รหัสนี้',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey.shade600,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            const SizedBox(height: 12),
                          ],
                        ],

                        const SizedBox(height: 16),
                        if (widget.qrCode.isNotEmpty)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 10,
                            ),
                            decoration: BoxDecoration(
                              color: _remainingSeconds <= 0
                                  ? Colors.red.shade50
                                  : Colors.grey.shade50,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: _remainingSeconds <= 0
                                    ? Colors.red.shade300
                                    : Colors.grey.shade300,
                              ),
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    widget.qrCode,
                                    style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600,
                                      fontFamily: 'monospace',
                                      color: _remainingSeconds <= 0
                                          ? Colors.grey.shade500
                                          : Colors.black87,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                GestureDetector(
                                  onTap: _remainingSeconds <= 0
                                      ? null
                                      : () async {
                                          await Clipboard.setData(
                                            ClipboardData(text: widget.qrCode),
                                          );
                                          if (mounted) {
                                            ScaffoldMessenger.of(
                                              context,
                                            ).showSnackBar(
                                              const SnackBar(
                                                content: Text('คัดลอกสำเร็จ'),
                                              ),
                                            );
                                          }
                                        },
                                  child: Text(
                                    'คัดลอก',
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: _remainingSeconds <= 0
                                          ? Colors.grey.shade400
                                          : Colors.blue,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        if (_remainingSeconds <= 0)
                          Padding(
                            padding: const EdgeInsets.only(top: 12),
                            child: Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.red.shade50,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: Colors.red.shade300),
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    Icons.error_outline,
                                    color: Colors.red.shade700,
                                    size: 20,
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Text(
                                      'QR นี้หมดอายุแล้ว\nไม่สามารถใช้งานได้',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: Colors.red.shade700,
                                        fontWeight: FontWeight.w500,
                                        height: 1.4,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade50,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.grey.shade200),
                    ),
                    child: Column(
                      children: [
                        _detailRow(
                          'รางวัล:',
                          (widget.reward?['reward_name'] ??
                                  widget.reward?['name'] ??
                                  'รางวัล')
                              .toString(),
                        ),
                        const SizedBox(height: 8),
                        _detailRow(
                          'แต้มที่ใช้:',
                          '${(widget.reward?['points_redeemed'] ?? widget.originalReward?['points_required'] ?? widget.reward?['points_required'] ?? 0).toInt()} แต้ม',
                        ),
                        const SizedBox(height: 8),
                        _detailRow(
                          'วันแลก:',
                          _formatExpiryDate(
                            widget.reward?['created_at'] ??
                                widget.reward?['redeemed_at'],
                          ),
                        ),
                        const SizedBox(height: 8),
                        _detailRow(
                          'วันหมดอายุ:',
                          _formatExpiryDate(
                            // ใช้ widget.expiresAt ก่อนเสมอ (consistent กับ countdown)
                            widget.expiresAt ?? widget.reward?['expires_at'],
                          ),
                        ),
                        const SizedBox(height: 8),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.blue.shade50,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.blue.shade200),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(
                              Icons.info_outline,
                              size: 20,
                              color: Colors.blue.shade700,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'วิธีใช้รหัส',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 12,
                                  color: Colors.blue.shade700,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          (widget.originalReward?['usage_instructions'] ??
                                  widget.reward?['usage_instructions'] ??
                                  '• แสดง QR Code หรือสแกนที่จุดแลก\n'
                                      '• ใช้ได้ตามเงื่อนไขของรางวัล\n'
                                      '• ใช้ได้เพียง 1 ครั้งต่อการแลก\n'
                                      '• หลังจากหมดอายุจะใช้ไม่ได้อีก')
                              .toString(),
                          style: TextStyle(
                            fontSize: 11,
                            color: Colors.blue.shade700,
                            height: 1.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => Navigator.pop(context),
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            side: BorderSide(color: Colors.grey.shade300),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: const Text(
                            'ปิด',
                            style: TextStyle(
                              color: Colors.grey,
                              fontWeight: FontWeight.w600,
                              fontSize: 14,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      if (_remainingSeconds <= 0)
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: () {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('กำลังขอ QR ใหม่...'),
                                  duration: Duration(seconds: 2),
                                ),
                              );
                              Navigator.pop(context);
                              Future.delayed(
                                const Duration(milliseconds: 500),
                                () {
                                  Navigator.pop(context);
                                },
                              );
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.orange,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            icon: const Icon(Icons.refresh, size: 18),
                            label: const Text(
                              'ขอ QR ใหม่',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w600,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        )
                      else
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: () {
                              Navigator.of(context).pop();
                              Navigator.of(context).pop(true);
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.blue,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            icon: const Icon(Icons.notifications, size: 18),
                            label: const Text(
                              'ดูการแจ้งเตือน',
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w600,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ========================================
// Reward Codes Dialog
// ========================================
class _RewardCodesDialog extends StatefulWidget {
  final dynamic rewardId;
  final String rewardName;
  final String phoneNumber;

  const _RewardCodesDialog({
    required this.rewardId,
    required this.rewardName,
    required this.phoneNumber,
  });

  @override
  State<_RewardCodesDialog> createState() => _RewardCodesDialogState();
}

class _RewardCodesDialogState extends State<_RewardCodesDialog> {
  bool _isLoading = true;
  List<dynamic> _promoCodes = [];
  Map<String, int> _statusCounts = {'available': 0, 'used': 0, 'expired': 0};

  @override
  void initState() {
    super.initState();
    _loadPromoCodes();
  }

  Future<void> _loadPromoCodes() async {
    try {
      final codes = await RewardService.getPromoCodesByReward(widget.rewardId);

      if (mounted) {
        final counts = {'available': 0, 'used': 0, 'expired': 0};

        for (var code in codes) {
          final status = code['status'] ?? 'available';
          if (counts.containsKey(status)) {
            counts[status] = (counts[status] ?? 0) + 1;
          }
        }

        setState(() {
          _promoCodes = codes;
          _statusCounts = counts;
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint('Error loading promo codes: $e');
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(16),
                  topRight: Radius.circular(16),
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  GestureDetector(
                    onTap: () => Navigator.pop(context),
                    child: const Icon(Icons.arrow_back, size: 24),
                  ),
                  Expanded(
                    child: Text(
                      widget.rewardName,
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: 24),
                ],
              ),
            ),

            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'สถานะโค้ด',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Colors.grey,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      _buildStatCard(
                        'พร้อมใช้',
                        _statusCounts['available'] ?? 0,
                        Colors.green,
                      ),
                      const SizedBox(width: 10),
                      _buildStatCard(
                        'ใช้แล้ว',
                        _statusCounts['used'] ?? 0,
                        Colors.blue,
                      ),
                      const SizedBox(width: 10),
                      _buildStatCard(
                        'หมดอายุ',
                        _statusCounts['expired'] ?? 0,
                        Colors.red,
                      ),
                    ],
                  ),

                  const SizedBox(height: 20),

                  const Text(
                    'รายการโค้ดทั้งหมด',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Colors.grey,
                    ),
                  ),
                  const SizedBox(height: 12),

                  if (_isLoading)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 20),
                      child: Center(
                        child: SizedBox(
                          height: 40,
                          width: 40,
                          child: CircularProgressIndicator(
                            strokeWidth: 3,
                            valueColor: AlwaysStoppedAnimation<Color>(
                              Colors.blue.shade600,
                            ),
                          ),
                        ),
                      ),
                    )
                  else if (_promoCodes.isEmpty)
                    Center(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 20),
                        child: Column(
                          children: [
                            Icon(
                              Icons.info_outline,
                              size: 32,
                              color: Colors.grey.shade400,
                            ),
                            const SizedBox(height: 8),
                            const Text(
                              'ไม่มีโค้ดสำหรับรางวัลนี้',
                              style: TextStyle(
                                color: Colors.grey,
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                      ),
                    )
                  else
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 300),
                      child: ListView.builder(
                        shrinkWrap: true,
                        itemCount: _promoCodes.length,
                        itemBuilder: (context, index) {
                          final code = _promoCodes[index];
                          final codeValue =
                              code['code'] ?? code['promo_code'] ?? '-';
                          final status = code['status'] ?? 'available';
                          final isUsed = status == 'used';
                          final isExpired = status == 'expired';

                          return Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: isExpired
                                  ? Colors.red.shade50
                                  : isUsed
                                  ? Colors.green.shade50
                                  : Colors.green.shade50,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: isExpired
                                    ? Colors.red.shade200
                                    : isUsed
                                    ? Colors.blue.shade200
                                    : Colors.green.shade200,
                              ),
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        codeValue,
                                        style: const TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w600,
                                          fontFamily: 'monospace',
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        _getStatusLabel(status),
                                        style: TextStyle(
                                          fontSize: 11,
                                          color: isExpired
                                              ? Colors.red.shade700
                                              : isUsed
                                              ? Colors.green.shade700
                                              : Colors.green.shade700,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                      if (isUsed && code['used_at'] != null)
                                        Padding(
                                          padding: const EdgeInsets.only(
                                            top: 4,
                                          ),
                                          child: Text(
                                            'ใช้เมื่อ: ${_formatDateTime(code['used_at'])}',
                                            style: TextStyle(
                                              fontSize: 10,
                                              color: Colors.grey.shade600,
                                            ),
                                          ),
                                        ),
                                      if (code['expiry_date'] != null)
                                        Padding(
                                          padding: const EdgeInsets.only(
                                            top: 4,
                                          ),
                                          child: Text(
                                            'หมดอายุ: ${_formatDate(code['expiry_date'])}',
                                            style: TextStyle(
                                              fontSize: 10,
                                              color: Colors.grey.shade600,
                                            ),
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 4,
                                  ),
                                  decoration: BoxDecoration(
                                    color: isExpired
                                        ? Colors.red
                                        : isUsed
                                        ? Colors.blue
                                        : Colors.green,
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    status.toUpperCase(),
                                    style: const TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.bold,
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),

                  const SizedBox(height: 20),

                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () => Navigator.pop(context),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.blue,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: const Text(
                        'ปิด',
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatCard(String label, int count, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: color.withAlpha(25),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withAlpha(100)),
        ),
        child: Column(
          children: [
            Text(
              count.toString(),
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 11,
                color: color,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _getStatusLabel(String status) {
    switch (status) {
      case 'used':
        return 'ใช้แล้ว';
      case 'expired':
        return 'หมดอายุ';
      case 'available':
      default:
        return 'พร้อมใช้';
    }
  }

  String _formatDateTime(dynamic value) {
    if (value == null) return '-';
    try {
      final raw = value.toString();
      final utcStr = raw.endsWith('Z') || raw.contains('+') ? raw : '${raw}Z';
      final dt = DateTime.parse(utcStr).add(const Duration(hours: 7));
      final hh = dt.hour.toString().padLeft(2, '0');
      final mm = dt.minute.toString().padLeft(2, '0');
      final dd = dt.day.toString().padLeft(2, '0');
      final mo = dt.month.toString().padLeft(2, '0');
      return '$dd/$mo/${dt.year} $hh:$mm';
    } catch (_) {
      return value.toString();
    }
  }

  String _formatDate(dynamic value) {
    if (value == null) return '-';
    try {
      final raw = value.toString();
      final utcStr = raw.endsWith('Z') || raw.contains('+') ? raw : '${raw}Z';
      final dt = DateTime.parse(utcStr).add(const Duration(hours: 7));
      final dd = dt.day.toString().padLeft(2, '0');
      final mo = dt.month.toString().padLeft(2, '0');
      return '$dd/$mo/${dt.year}';
    } catch (_) {
      return value.toString();
    }
  }
}