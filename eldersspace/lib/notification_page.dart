import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:barcode_widget/barcode_widget.dart';
import 'services/api_service.dart';
import 'services/ad_service.dart';
import 'partner_page.dart';
import 'widgets/comment_dialog.dart';

class NotificationPage extends StatefulWidget {
  final String phoneNumber;

  const NotificationPage({super.key, required this.phoneNumber});

  @override
  State<NotificationPage> createState() => _NotificationPageState();
}

class _NotificationPageState extends State<NotificationPage> {
  late Future<List<Map<String, dynamic>>> _notificationsFuture;
  bool _ownershipVerified = true;
  List<Map<String, dynamic>> _adNotifications = [];

  @override
  void initState() {
    super.initState();
    _notificationsFuture = _loadNotifications();
    _loadAdNotifications();
  }

  Future<void> _loadAdNotifications() async {
    final ads = await AdService.getNotificationAds();
    if (!mounted) return;
    setState(() => _adNotifications = ads);
    for (final ad in ads) {
      final id = int.tryParse(ad['id']?.toString() ?? '');
      if (id != null) AdService.trackView(id);
    }
  }

  Future<List<Map<String, dynamic>>> _loadNotifications() async {
    final notifications = await ApiService.getNotifications(widget.phoneNumber);
    if (!mounted) return notifications;

    final mismatched = notifications.any(
      (item) => (item['owner_phone']?.toString() ?? '') != widget.phoneNumber,
    );

    setState(() {
      _ownershipVerified = !mismatched;
    });

    return notifications;
  }

  Future<void> _refresh() async {
    setState(() {
      _notificationsFuture = _loadNotifications();
    });
    await _notificationsFuture;
    _loadAdNotifications();
  }

  String _formatTimeAgo(String? raw) {
    if (raw == null || raw.isEmpty) return '';
    try {
      final utcStr = raw.endsWith('Z') || raw.contains('+') ? raw : '${raw}Z';
      final time = DateTime.parse(utcStr);
      final diff = DateTime.now().toUtc().difference(time);
      if (diff.inDays >= 365) return '${(diff.inDays / 365).floor()} ปีที่แล้ว';
      if (diff.inDays >= 30) return '${(diff.inDays / 30).floor()} เดือนที่แล้ว';
      if (diff.inDays > 0) return '${diff.inDays} วันที่แล้ว';
      if (diff.inHours > 0) return '${diff.inHours} ชั่วโมงที่แล้ว';
      if (diff.inMinutes > 0) return '${diff.inMinutes} นาทีที่แล้ว';
      return 'เมื่อสักครู่';
    } catch (_) {
      return raw;
    }
  }

  String _notificationMessage(Map<String, dynamic> item) {
    final actorName = item['full_name']?.toString().trim().isNotEmpty == true
        ? item['full_name'].toString()
        : 'มีคน';

    switch (item['type']) {
      case 'like':
        return '$actorName กดถูกใจโพสต์ของคุณ';
      case 'comment':
        return '$actorName แสดงความคิดเห็นในโพสต์ของคุณ';
      case 'reply':
        return '$actorName ตอบกลับความคิดเห็นของคุณ';
      case 'follow':
        return '$actorName ติดตามคุณ';
      case 'share':
        return '$actorName แชร์โพสต์ของคุณ';
      case 'reward_redemption':
        final rewardName = item['reward_name'] ?? 'รางวัล';
        return 'คุณแลก $rewardName เรียบร้อยแล้ว';
      default:
        return '$actorName มีการแจ้งเตือนใหม่';
    }
  }

  IconData _notificationIcon(Map<String, dynamic> item) {
    switch (item['type']) {
      case 'like':
        return Icons.thumb_up_alt_rounded;
      case 'comment':
        return Icons.chat_bubble_rounded;
      case 'reply':
        return Icons.reply_rounded;
      case 'follow':
        return Icons.person_add_alt_1_rounded;
      case 'share':
        return Icons.reply_all_rounded;
      case 'reward_redemption':
        return Icons.card_giftcard;
      default:
        return Icons.notifications_rounded;
    }
  }

  Color _notificationColor(Map<String, dynamic> item) {
    switch (item['type']) {
      case 'like':
        return const Color(0xFF3B6FD4);
      case 'comment':
        return const Color(0xFF4CAF50);
      case 'reply':
        return const Color(0xFF9C27B0);
      case 'follow':
        return const Color(0xFFFF9800);
      case 'share':
        return const Color(0xFF009688);
      case 'reward_redemption':
        return const Color(0xFF27C77F);
      default:
        return Colors.grey;
    }
  }

  void _showRewardDetail(Map<String, dynamic> notification) {
    // Parse content if it's a JSON string
    Map<String, dynamic> rewardData = {};
    if (notification['content'] != null) {
      try {
        if (notification['content'] is String) {
          rewardData = Map<String, dynamic>.from(
            jsonDecode(notification['content']) as Map<dynamic, dynamic>
          );
        } else if (notification['content'] is Map) {
          rewardData = Map<String, dynamic>.from(
            notification['content'] as Map<dynamic, dynamic>
          );
        }
      } catch (e) {
        debugPrint('Error parsing reward data: $e');
      }
    }

    final qrCode = rewardData['qr_code'] ?? notification['qr_code'] ?? '';
    final rewardName = rewardData['reward_name'] ?? notification['reward_name'] ?? 'รางวัล';
    final pointsUsed = rewardData['points_used'] ?? notification['points_used'] ?? 0;
    final expiresAt = rewardData['expires_at'] ?? notification['expires_at'];
    final createdAt = notification['created_at'];

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
              // Content
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Status Badge
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF27C77F).withAlpha(26),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: const Color(0xFF27C77F).withAlpha(128),
                        ),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Text(
                            '✓',
                            style: TextStyle(
                              fontSize: 18,
                              color: Color(0xFF27C77F),
                            ),
                          ),
                          const SizedBox(width: 8),
                          const Text(
                            'แลกแต้มสำเร็จ',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFF27C77F),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),

                    // QR Code Container
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.grey.shade200),
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
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: Colors.grey.shade200),
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
                                border: Border.all(color: Colors.grey.shade300),
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
                          // QR Code text
                          if (qrCode.isNotEmpty)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 8,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.grey.shade50,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: Colors.grey.shade300),
                              ),
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
                        ],
                      ),
                    ),

                    const SizedBox(height: 20),

                    // Details
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
                          // Reward Name
                          _detailRowNotification('รางวัล:', rewardName),
                          const Divider(height: 12),
                          // Points Used
                          _detailRowNotification(
                            'แต้มที่ใช้:',
                            '$pointsUsed แต้ม',
                          ),
                          const Divider(height: 12),
                          // Date Redeemed
                          _detailRowNotification(
                            'วันแลก:',
                            createdAt != null
                                ? _formatDateTimeNotif(createdAt)
                                : '-',
                          ),
                          // Expiry Date
                          if (expiresAt != null) ...[
                            const Divider(height: 12),
                            _detailRowNotification(
                              'วันหมดอายุ:',
                              _formatDateTimeNotif(expiresAt),
                            ),
                          ],
                        ],
                      ),
                    ),

                    const SizedBox(height: 20),

                    // Redemption Format Selection
                    if (qrCode.isNotEmpty)
                      _buildRedemptionFormatSelector(context, qrCode, rewardName),

                    const SizedBox(height: 20),

                    // Close button
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

  Widget _detailRowNotification(String label, String value) {
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

  String _formatDateTimeNotif(dynamic value) {
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

  Widget _buildRedemptionFormatSelector(BuildContext context, String qrCode, String rewardName) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: Colors.green.shade50,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.blue.shade200),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'เลือกวิธีแลก',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: Colors.green.shade700,
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
                      onTap: () => _showRedemptionFormat('qr_code', qrCode, rewardName),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _buildFormatOption(
                      icon: Icons.barcode_reader,
                      label: 'Barcode',
                      color: Colors.orange,
                      onTap: () => _showRedemptionFormat('barcode', qrCode, rewardName),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _buildFormatOption(
                      icon: Icons.tag,
                      label: 'Code',
                      color: Colors.blue,
                      onTap: () => _showRedemptionFormat('code', qrCode, rewardName),
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
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withAlpha(128)),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: color, size: 24),
            const SizedBox(height: 4),
            Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
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
                  color: Colors.green.shade50,
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
                    // Title
                    Text(
                      rewardName,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 20),

                    // Display the format
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

                    // Instructions
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.green.shade50,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.blue.shade200),
                      ),
                      child: Text(
                        'แสดง$formatTitleนี้ที่จุดแลกรับเพื่อรับรางวัลของคุณ',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.green.shade700,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),

                    const SizedBox(height: 20),

                    // Close button
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7F9FC),
      appBar: AppBar(
        title: const Text('แจ้งเตือน'),
        centerTitle: false,
      ),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _notificationsFuture,
        builder: (context, snapshot) {
          final isLoading = snapshot.connectionState == ConnectionState.waiting;
          final error = snapshot.error;
          final notifications = snapshot.data ?? const <Map<String, dynamic>>[];

          if (isLoading) {
            return const Center(child: CircularProgressIndicator());
          }

          if (error != null) {
            return _EmptyState(
              icon: Icons.cloud_off_rounded,
              title: 'โหลดแจ้งเตือนไม่สำเร็จ',
              message: error.toString(),
              actionText: 'ลองใหม่',
              onAction: _refresh,
            );
          }

          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              children: [
                _AccountBanner(
                  phoneNumber: widget.phoneNumber,
                  verified: _ownershipVerified,
                ),
                const SizedBox(height: 12),
                // Sponsored notification ads
                if (_adNotifications.isNotEmpty) ...[
                  ..._adNotifications.map((ad) => _SponsoredAdTile(
                    ad: ad,
                    onTap: () {
                      final pid = ad['partner_id'] != null
                          ? int.tryParse(ad['partner_id'].toString())
                          : null;
                      final adId = int.tryParse(ad['id']?.toString() ?? '');
                      if (adId != null) AdService.trackClick(adId);
                      if (pid != null) {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => PartnerPage(partnerId: pid),
                          ),
                        );
                      }
                    },
                  )),
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 4),
                    child: Divider(height: 1),
                  ),
                ],
                if (notifications.isEmpty && _adNotifications.isEmpty)
                  const _EmptyState(
                    icon: Icons.notifications_off_rounded,
                    title: 'ยังไม่มีแจ้งเตือน',
                    message: 'เมื่อมีคนกดถูกใจ แสดงความคิดเห็น หรือแชร์โพสต์ของคุณ จะแสดงที่หน้านี้',
                  )
                else if (notifications.isEmpty)
                  const SizedBox.shrink()
                else
                  ...notifications.map(
                    (item) => _NotificationTile(
                      message: _notificationMessage(item),
                      createdAt: _formatTimeAgo(item['created_at']?.toString()),
                      icon: _notificationIcon(item),
                      color: _notificationColor(item),
                      verified: (item['owner_phone']?.toString() ?? '') == widget.phoneNumber,
                      onTap: item['type'] == 'reward_redemption'
                          ? () => _showRewardDetail(item)
                          : (item['post_id'] == null
                              ? null
                              : () {
                                  final postId = int.tryParse(item['post_id'].toString()) ?? 0;
                                  if (postId <= 0) return;

                                  showModalBottomSheet(
                                    context: context,
                                    isScrollControlled: true,
                                    builder: (_) => CommentDialog(
                                      postId: postId,
                                      currentUserPhone: widget.phoneNumber,
                                      userPhoneForCommentCreation: widget.phoneNumber,
                                      baseUrl: ApiService.baseUrl,
                                      onCommentAdded: _refresh,
                                    ),
                                  );
                                }),
                    ),
                  ),
                const SizedBox(height: 24),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _AccountBanner extends StatelessWidget {
  final String phoneNumber;
  final bool verified;

  const _AccountBanner({required this.phoneNumber, required this.verified});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: verified ? const Color(0xFF2E7D32).withValues(alpha: 0.18) : const Color(0xFFD32F2F).withValues(alpha: 0.18),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: verified ? const Color(0xFF2E7D32).withValues(alpha: 0.12) : const Color(0xFFD32F2F).withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(
              verified ? Icons.verified_rounded : Icons.warning_amber_rounded,
              color: verified ? const Color(0xFF2E7D32) : const Color(0xFFD32F2F),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  verified ? 'แจ้งเตือนของบัญชีนี้' : 'พบความไม่ตรงกันของบัญชี',
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text(
                  phoneNumber,
                  style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  final String message;
  final String createdAt;
  final IconData icon;
  final Color color;
  final bool verified;
  final VoidCallback? onTap;

  const _NotificationTile({
    required this.message,
    required this.createdAt,
    required this.icon,
    required this.color,
    required this.verified,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: verified ? Colors.transparent : const Color(0xFFD32F2F).withValues(alpha: 0.18),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: ListTile(
        onTap: onTap,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: color),
        ),
        title: Text(
          message,
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            createdAt,
            style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
          ),
        ),
        trailing: verified ? null : const Icon(Icons.error_outline, color: Color(0xFFD32F2F)),
      ),
    );
  }
}

class _SponsoredAdTile extends StatelessWidget {
  final Map<String, dynamic> ad;
  final VoidCallback? onTap;

  const _SponsoredAdTile({required this.ad, this.onTap});

  @override
  Widget build(BuildContext context) {
    final title       = AdService.sanitizeText(ad['title']?.toString());
    final body        = AdService.sanitizeText(ad['body']?.toString());
    final partnerName = ad['partner_name']?.toString() ?? '';
    final logoUrl     = AdService.resolveImageUrl(ad['partner_logo']?.toString());
    final ctaText     = ad['cta_text']?.toString() ?? 'ดูเพิ่มเติม';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF6C47D4).withValues(alpha: 0.25)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Partner logo or ad icon
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: const Color(0xFF6C47D4).withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: logoUrl.isNotEmpty
                    ? ClipOval(
                        child: Image.network(
                          logoUrl,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) =>
                              const Icon(Icons.campaign_rounded,
                                  color: Color(0xFF6C47D4)),
                        ),
                      )
                    : const Icon(Icons.campaign_rounded,
                        color: Color(0xFF6C47D4)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0xFF6C47D4),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text(
                            'สนับสนุน',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        if (partnerName.isNotEmpty) ...[
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              partnerName,
                              style: TextStyle(
                                fontSize: 11,
                                color: Colors.grey.shade500,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 5),
                    Text(
                      title,
                      style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w600),
                    ),
                    if (body.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        body,
                        style: TextStyle(
                            fontSize: 12, color: Colors.grey.shade600),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                    const SizedBox(height: 8),
                    Text(
                      ctaText,
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF6C47D4),
                        fontWeight: FontWeight.w600,
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
}

class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;
  final String? actionText;
  final VoidCallback? onAction;

  const _EmptyState({
    required this.icon,
    required this.title,
    required this.message,
    this.actionText,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 56, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: Colors.grey.shade600, height: 1.4),
            ),
            if (actionText != null && onAction != null) ...[
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: onAction,
                child: Text(actionText!),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

