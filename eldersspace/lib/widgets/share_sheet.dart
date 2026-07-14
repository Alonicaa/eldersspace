import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:share_plus/share_plus.dart';

class ShareSheet extends StatelessWidget {
  final Map post;
  final String currentUserPhone;
  final String baseUrl;
  final String? myName;
  final String? myAvatarUrl;
  final String selectedVisibility;
  final Function(String)? onVisibilityChanged;
  final VoidCallback? onShareComplete;
  final VoidCallback? onShareInApp;

  const ShareSheet({
    required this.post,
    required this.currentUserPhone,
    required this.baseUrl,
    this.myName,
    this.myAvatarUrl,
    this.selectedVisibility = 'public',
    this.onVisibilityChanged,
    this.onShareComplete,
    this.onShareInApp,
  });

  static String formatTimeAgo(String? createdAt) {
    if (createdAt == null) return '';
    try {
      final postTime = DateTime.parse(createdAt);
      final now = DateTime.now();
      final difference = now.difference(postTime);
      if (difference.inDays >= 365) {
        return '${(difference.inDays / 365).floor()} ปีที่แล้ว';
      }
      if (difference.inDays >= 30) {
        return '${(difference.inDays / 30).floor()} เดือนที่แล้ว';
      }
      if (difference.inDays > 0) return '${difference.inDays} วันที่แล้ว';
      if (difference.inHours > 0) return '${difference.inHours} ชั่วโมงที่แล้ว';
      if (difference.inMinutes > 0) return '${difference.inMinutes} นาทีที่แล้ว';
      return 'เมื่อสักครู่';
    } catch (e) {
      return '';
    }
  }

  static IconData getVisibilityIcon(String? v) {
    switch (v) {
      case 'friends':
        return Icons.people;
      case 'followers':
        return Icons.person_add;
      case 'only_me':
        return Icons.lock;
      default:
        return Icons.public;
    }
  }

  @override
  Widget build(BuildContext context) {
    final String content = post["content"] ?? "";
    final String postLink =
        "https://eldersspace.vercel.app/post/${post['post_id']}";

    return SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            margin: const EdgeInsets.only(top: 10, bottom: 4),
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey.shade300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text(
              "แชร์โพสต์",
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
          ),
          const Divider(height: 1),
          _menuTile(
            icon: Icons.share,
            iconColor: const Color(0xFF1877F2),
            title: "แชร์ภายในแอพ",
            subtitle: "เพิ่มข้อความและแชร์ให้เพื่อนของคุณ",
            onTap: () {
              Navigator.pop(context);
              onShareInApp?.call();
            },
          ),
          _menuTile(
            icon: Icons.share_outlined,
            iconColor: const Color(0xFF25D366),
            title: "แชร์ไปยังแอพอื่น",
            subtitle: "ส่งลิงก์ผ่าน LINE, WhatsApp และอื่นๆ",
            onTap: () {
              Navigator.pop(context);
              final text = content.isNotEmpty
                  ? "$content\n\n$postLink"
                  : postLink;
              Share.share(text, subject: "โพสต์จาก EldersSpace");
            },
          ),
          _menuTile(
            icon: Icons.link,
            iconColor: Colors.black87,
            title: "คัดลอกลิงก์",
            subtitle: postLink,
            onTap: () {
              Navigator.pop(context);
              Clipboard.setData(ClipboardData(text: postLink));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text("คัดลอกลิงก์แล้ว ✅")),
              );
            },
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }

  static Widget _menuTile({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
    Color? titleColor,
  }) {
    return ListTile(
      leading: Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(
          color: Colors.grey.shade100,
          shape: BoxShape.circle,
        ),
        child: Icon(icon, color: iconColor, size: 22),
      ),
      title: Text(
        title,
        style: TextStyle(
          fontWeight: FontWeight.w600,
          color: titleColor ?? Colors.black87,
          fontSize: 15,
        ),
      ),
      subtitle: Text(
        subtitle,
        style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      onTap: onTap,
    );
  }
}

/// Advanced share sheet with caption and visibility
class SharePostSheet extends StatefulWidget {
  final Map post;
  final String currentUserPhone;
  final String baseUrl;
  final String? myName;
  final String? myAvatarUrl;
  final VoidCallback? onShareComplete;

  const SharePostSheet({
    required this.post,
    required this.currentUserPhone,
    required this.baseUrl,
    this.myName,
    this.myAvatarUrl,
    this.onShareComplete,
  });

  @override
  State<SharePostSheet> createState() => _SharePostSheetState();
}

class _SharePostSheetState extends State<SharePostSheet> {
  late TextEditingController captionController;
  String _selectedVisibility = 'public';

  @override
  void initState() {
    super.initState();
    captionController = TextEditingController();
  }

  @override
  void dispose() {
    captionController.dispose();
    super.dispose();
  }

  static String _visibilityLabel(String v) {
    switch (v) {
      case 'friends':
        return 'เพื่อน';
      case 'followers':
        return 'ผู้ติดตาม';
      case 'only_me':
        return 'เฉพาะฉัน';
      default:
        return 'สาธารณะ';
    }
  }

  static IconData _visibilityIcon(String v) {
    switch (v) {
      case 'friends':
        return Icons.people;
      case 'followers':
        return Icons.person_add;
      case 'only_me':
        return Icons.lock;
      default:
        return Icons.public;
    }
  }

  Future<void> sharePost(String caption) async {
    try {
      final req = http.MultipartRequest(
        'POST',
        Uri.parse('${widget.baseUrl}/posts'),
      );
      req.fields['phone'] = widget.currentUserPhone;
      req.fields['content'] = caption.isNotEmpty ? caption : '';
      req.fields['shared_post_id'] = widget.post['post_id'].toString();
      req.fields['visibility'] = _selectedVisibility;
      final shareRes = await req.send();
      if (shareRes.statusCode < 200 || shareRes.statusCode >= 300) {
        final body = await shareRes.stream.bytesToString();
        throw Exception('แชร์โพสต์ไม่สำเร็จ (${shareRes.statusCode}): $body');
      }

      // ขอรับแต้มแชร์กิจกรรมหลังแชร์สำเร็จ (1 ครั้งต่อกิจกรรม)
      await http.post(
        Uri.parse(
          '${widget.baseUrl}/rewards/check-share-activity/${widget.currentUserPhone}',
        ),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'shared_post_id': widget.post['post_id']}),
      );

      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('แชร์โพสต์สำเร็จ ✅')),
        );
        widget.onShareComplete?.call();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('เกิดข้อผิดพลาด: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    final maxH = MediaQuery.of(context).size.height * 0.92;

    return AnimatedPadding(
      duration: const Duration(milliseconds: 150),
      padding: EdgeInsets.only(bottom: bottomInset),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxH),
        child: Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // ── Handle ──
              Container(
                margin: const EdgeInsets.only(top: 10, bottom: 4),
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),

              // ── Header ──
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 10,
                ),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text(
                        "แชร์โพสต์",
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    GestureDetector(
                      onTap: () => Navigator.pop(context),
                      child: Container(
                        width: 30,
                        height: 30,
                        decoration: BoxDecoration(
                          color: Colors.grey.shade200,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.close,
                          size: 18,
                          color: Colors.black87,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              const Divider(height: 1),

              // ── Scrollable content ──
              Flexible(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // ── Author row ──
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                        child: Row(
                          children: [
                            CircleAvatar(
                              radius: 22,
                              backgroundColor: const Color(0xFF1877F2),
                              backgroundImage: widget.myAvatarUrl != null
                                  ? NetworkImage(widget.myAvatarUrl!)
                                  : null,
                              child: widget.myAvatarUrl == null
                                  ? Text(
                                      (widget.myName ?? widget.currentUserPhone)
                                              .isNotEmpty
                                          ? (widget.myName ?? widget.currentUserPhone)[0]
                                              .toUpperCase()
                                          : '?',
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    )
                                  : null,
                            ),
                            const SizedBox(width: 10),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  widget.myName ?? widget.currentUserPhone,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 15,
                                  ),
                                ),
                                // ── Visibility badge ──
                                GestureDetector(
                                  onTap: () => _showVisibilityPicker(),
                                  child: Container(
                                    margin: const EdgeInsets.only(top: 3),
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 3,
                                    ),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF1877F2)
                                          .withValues(alpha: 0.1),
                                      borderRadius: BorderRadius.circular(6),
                                      border: Border.all(
                                        color: const Color(0xFF1877F2)
                                            .withValues(alpha: 0.3),
                                      ),
                                    ),
                                    child: Row(
                                      children: [
                                        Icon(
                                          _visibilityIcon(_selectedVisibility),
                                          size: 13,
                                          color: const Color(0xFF1877F2),
                                        ),
                                        const SizedBox(width: 4),
                                        Text(
                                          _visibilityLabel(_selectedVisibility),
                                          style: const TextStyle(
                                            fontSize: 12,
                                            color: Color(0xFF1877F2),
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                        const SizedBox(width: 3),
                                        const Icon(
                                          Icons.keyboard_arrow_down,
                                          size: 14,
                                          color: Color(0xFF1877F2),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),

                      // ── Caption input ──
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 8,
                        ),
                        child: TextField(
                          controller: captionController,
                          maxLines: null,
                          minLines: 2,
                          keyboardType: TextInputType.multiline,
                          style: const TextStyle(fontSize: 17),
                          decoration: const InputDecoration(
                            hintText: "พูดอะไรสักอย่างเกี่ยวกับโพสต์นี้...",
                            hintStyle: TextStyle(
                              fontSize: 16,
                              color: Colors.black38,
                            ),
                            border: InputBorder.none,
                            contentPadding: EdgeInsets.zero,
                          ),
                        ),
                      ),

                      const SizedBox(height: 4),

                      // ── Original post preview ──
                      _PostPreviewCard(post: widget.post),
                    ],
                  ),
                ),
              ),

              // ── Bottom button ──
              const Divider(height: 1),

              Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () async {
                      await sharePost(captionController.text);
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF1877F2),
                      foregroundColor: Colors.white,
                      elevation: 0,
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    child: const Text(
                      "แชร์ตอนนี้",
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showVisibilityPicker() {
    final options = [
      {
        'value': 'public',
        'label': 'สาธารณะ',
        'sub': 'ทุกคนเห็นได้',
        'icon': Icons.public,
      },
      {
        'value': 'friends',
        'label': 'เพื่อน',
        'sub': 'คนที่ฟอลกันและกัน',
        'icon': Icons.people,
      },
      {
        'value': 'followers',
        'label': 'เฉพาะผู้ติดตาม',
        'sub': 'คนที่ติดตามคุณอยู่',
        'icon': Icons.person_add,
      },
      {
        'value': 'only_me',
        'label': 'เฉพาะฉัน',
        'sub': 'มองเห็นแค่คุณคนเดียว',
        'icon': Icons.lock,
      },
    ];

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (_, setPicker) => Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              margin: const EdgeInsets.only(top: 10, bottom: 4),
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text(
                "ใครสามารถเห็นโพสต์นี้?",
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
            const Divider(height: 1),
            ...options.map((opt) {
              final isSelected = _selectedVisibility == opt['value'];
              return ListTile(
                leading: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: isSelected
                        ? const Color(0xFF1877F2).withValues(alpha: 0.12)
                        : Colors.grey.shade100,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    opt['icon'] as IconData,
                    color: isSelected
                        ? const Color(0xFF1877F2)
                        : Colors.black54,
                    size: 22,
                  ),
                ),
                title: Text(
                  opt['label'] as String,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: isSelected
                        ? const Color(0xFF1877F2)
                        : Colors.black87,
                  ),
                ),
                subtitle: Text(
                  opt['sub'] as String,
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                ),
                trailing: isSelected
                    ? const Icon(Icons.check_circle, color: Color(0xFF1877F2))
                    : null,
                onTap: () {
                  setState(() => _selectedVisibility = opt['value'] as String);
                  Navigator.pop(ctx);
                },
              );
            }),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

// Preview card for shared post
class _PostPreviewCard extends StatelessWidget {
  final Map post;

  const _PostPreviewCard({required this.post});

  @override
  Widget build(BuildContext context) {
    final images = post['images'] ?? [];

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(12),
        color: Colors.grey.shade50,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Mini header
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 16,
                  backgroundColor: const Color(0xFFDDE3F0),
                  backgroundImage: post['profile_picture_url'] != null
                      ? NetworkImage(post['profile_picture_url'])
                      : null,
                  child: post['profile_picture_url'] == null
                      ? Text(
                          (post['full_name']?.toString().isNotEmpty == true
                              ? post['full_name'].toString()[0]
                              : '?')
                              .toUpperCase(),
                          style: const TextStyle(
                            color: Color(0xFF1877F2),
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        )
                      : null,
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      post['full_name'] ?? '',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                      ),
                    ),
                    Row(
                      children: [
                        Text(
                          ShareSheet.formatTimeAgo(post['created_at']),
                          style: TextStyle(
                            fontSize: 11,
                            color: Colors.grey.shade600,
                          ),
                        ),
                        const SizedBox(width: 3),
                        Icon(
                          ShareSheet.getVisibilityIcon(post['visibility']),
                          size: 10,
                          color: Colors.grey.shade600,
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),
          // Content
          if ((post['content'] ?? '').isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: Text(
                post['content'],
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 14,
                  color: Colors.black87,
                ),
              ),
            ),
          // First image
          if (images.isNotEmpty)
            ClipRRect(
              borderRadius: const BorderRadius.vertical(
                bottom: Radius.circular(12),
              ),
              child: Image.network(
                images[0],
                height: 160,
                width: double.infinity,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const SizedBox(),
              ),
            ),
          if (images.isEmpty && (post['content'] ?? '').isEmpty)
            const SizedBox(height: 4),
        ],
      ),
    );
  }
}

