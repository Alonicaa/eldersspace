import 'package:flutter/material.dart';
import '../article_detail_page.dart';

class PostCard extends StatelessWidget {
  final Map post;
  final String currentUserPhone;
  final Function(int) onLike;
  final Function(int) onComment;
  final Function() onShare;
  final Function() onMenu;
  final Function() onAvatarTap;
  final VoidCallback? onTtsStart;
  final VoidCallback? onTtsEnd;
  final String? speakingId;
  final bool isFromProfile;
  final bool isBlocked;
  final VoidCallback? onPostTap;

  const PostCard({
    required this.post,
    required this.currentUserPhone,
    required this.onLike,
    required this.onComment,
    required this.onShare,
    required this.onMenu,
    required this.onAvatarTap,
    this.onTtsStart,
    this.onTtsEnd,
    this.speakingId,
    this.isFromProfile = false,
    this.isBlocked = false,
    this.onPostTap,
  });

  static String formatTimeAgo(String? createdAt) {
    if (createdAt == null) return '';
    try {
      // MySQL DATETIME ไม่มี timezone → ถือเป็น UTC แล้วแปลงเป็น local (ไทย UTC+7)
      final normalized = createdAt.contains('T')
          ? createdAt
          : createdAt.replaceFirst(' ', 'T');
      final isoStr =
          (normalized.endsWith('Z') || normalized.contains('+'))
              ? normalized
              : '${normalized}Z';
      final postTime = DateTime.parse(isoStr).toLocal();
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

  static IconData getVisibilityIcon(String? visibility) {
    switch (visibility) {
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

  int _toInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }

  @override
  Widget build(BuildContext context) {
    bool liked = (post["user_like"] == "like");
    int likeCount = _toInt(post["likes"]);
    final int commentCount = _toInt(post["comments"]);
    final int shareCount = post["shares"] != null
        ? _toInt(post["shares"])
        : _toInt(post["share_count"]);
    final bool hasEngagement =
        likeCount > 0 || commentCount > 0 || shareCount > 0;
    final String? avatarUrl = post["profile_picture_url"];

    return StatefulBuilder(
      builder: (context, setLike) {
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          color: Colors.white,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Header ──
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 4, 8),
                child: Row(
                  children: [
                    GestureDetector(
                      onTap: onAvatarTap,
                      child: CircleAvatar(
                        radius: 22,
                        backgroundColor: const Color(0xFFDDE3F0),
                        backgroundImage: avatarUrl != null
                            ? NetworkImage(avatarUrl)
                            : null,
                        child: avatarUrl == null
                            ? Text(
                                (post["full_name"] ?? "?")
                                    .toString()
                                    .substring(0, 1)
                                    .toUpperCase(),
                                style: const TextStyle(
                                  color: Color(0xFF3B6FD4),
                                  fontWeight: FontWeight.bold,
                                  fontSize: 16,
                                ),
                              )
                            : null,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: GestureDetector(
                        onTap: onAvatarTap,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              post["full_name"] ?? "",
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 15,
                                color: Colors.black87,
                              ),
                            ),
                            const SizedBox(height: 1),
                            Row(
                              children: [
                                Text(
                                  formatTimeAgo(post["created_at"]),
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Colors.grey.shade600,
                                  ),
                                ),
                                const SizedBox(width: 4),
                                Icon(
                                  getVisibilityIcon(post["visibility"]),
                                  size: 12,
                                  color: Colors.grey.shade600,
                                ),
                              ],
                            ),
                            // ── Group badge ──
                            if (post["group_name"] != null)
                              Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 3,
                                  ),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF3B6FD4).withValues(alpha: 0.1),
                                    borderRadius: BorderRadius.circular(20),
                                    border: Border.all(
                                      color: const Color(0xFF3B6FD4).withValues(alpha: 0.3),
                                    ),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const Icon(
                                        Icons.group,
                                        size: 11,
                                        color: Color(0xFF3B6FD4),
                                      ),
                                      const SizedBox(width: 4),
                                      Text(
                                        post["group_name"] as String,
                                        style: const TextStyle(
                                          fontSize: 11,
                                          color: Color(0xFF3B6FD4),
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(
                        Icons.more_horiz,
                        color: Colors.black54,
                      ),
                      onPressed: () => onMenu(),
                    ),
                  ],
                ),
              ),

              // ── Content + TTS ──
              if ((post["content"] ?? "").isNotEmpty)
                GestureDetector(
                  onTap: onPostTap,
                  behavior: HitTestBehavior.opaque,
                  child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: _ExpandableText(
                          text: post["content"] ?? "",
                          maxLines: 3,
                        ),
                      ),
                      // ── TTS button ──
                      StatefulBuilder(
                        builder: (ctx, setTts) {
                          final ttsId = 'post_${post["post_id"]}';
                          final isReading = speakingId == ttsId;
                          return GestureDetector(
                            onTap: () {
                              final text = post["content"] ?? "";
                              if (text.isEmpty) return;
                              if (isReading) {
                                onTtsEnd?.call();
                              } else {
                                onTtsStart?.call();
                              }
                              setTts(() {});
                            },
                            child: Padding(
                              padding: const EdgeInsets.only(left: 6, top: 2),
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 200),
                                padding: const EdgeInsets.all(6),
                                decoration: BoxDecoration(
                                  color: isReading
                                      ? const Color(0xFF1877F2)
                                          .withValues(alpha: 0.12)
                                      : Colors.transparent,
                                  shape: BoxShape.circle,
                                ),
                                child: Icon(
                                  isReading
                                      ? Icons.stop_circle_outlined
                                      : Icons.volume_up_outlined,
                                  size: 22,
                                  color: isReading
                                      ? const Color(0xFF1877F2)
                                      : Colors.grey.shade500,
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ],
                  ),
                ),
                ),

              // ── Shared post preview ──
              if (post["shared_post"] != null)
                _SharedPostPreview(post: post["shared_post"]),

              // ── Linked article card ──
              if (post["linked_article"] != null)
                _ArticleCard(
                  article: post["linked_article"] as Map,
                  phoneNumber: currentUserPhone,
                ),

              // ── Images ──
              if (post["shared_post"] == null &&
                  (post["images"] ?? []).isNotEmpty)
                GestureDetector(
                  onTap: onPostTap,
                  behavior: HitTestBehavior.translucent,
                  child: Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: ImageGrid(
                      images: List<String>.from(post["images"] ?? []),
                    ),
                  ),
                ),

              // ── Engagement counts ──
              if (hasEngagement)
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                  child: Row(
                    children: [
                      if (likeCount > 0) ...[
                        Container(
                          width: 18,
                          height: 18,
                          decoration: const BoxDecoration(
                            color: Color(0xFF3B6FD4),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.thumb_up,
                            color: Colors.white,
                            size: 11,
                          ),
                        ),
                        const SizedBox(width: 5),
                        Text(
                          "$likeCount",
                          style: TextStyle(
                            color: Colors.grey.shade600,
                            fontSize: 13,
                          ),
                        ),
                      ],
                      const Spacer(),
                      if (commentCount > 0) ...[
                        Text(
                          "ความคิดเห็น $commentCount",
                          style: TextStyle(
                            color: Colors.grey.shade600,
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(width: 12),
                      ],
                      if (shareCount > 0)
                        Text(
                          "แชร์ $shareCount",
                          style: TextStyle(
                            color: Colors.grey.shade600,
                            fontSize: 13,
                          ),
                        ),
                    ],
                  ),
                ),

              // ── Divider ──
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                child: Divider(height: 1, color: Colors.grey.shade200),
              ),

              // ── Action buttons ──
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Expanded(
                      child: _ActionButton(
                        icon: liked ? Icons.thumb_up : Icons.thumb_up_outlined,
                        label: "ถูกใจ",
                        color: liked
                            ? const Color(0xFF3B6FD4)
                            : Colors.grey.shade700,
                        enabled: !isBlocked,
                        onTap: () {
                          setLike(() {
                            if (liked) {
                              liked = false;
                              likeCount = likeCount - 1;
                            } else {
                              liked = true;
                              likeCount = likeCount + 1;
                            }
                          });
                          onLike(post["post_id"]);
                        },
                      ),
                    ),
                    Expanded(
                      child: _ActionButton(
                        icon: Icons.chat_bubble_outline,
                        label: "ความคิดเห็น",
                        color: Colors.grey.shade700,
                        enabled: !isBlocked,
                        onTap: () => onComment(post["post_id"]),
                      ),
                    ),
                    Expanded(
                      child: _ActionButton(
                        icon: Icons.reply_outlined,
                        label: "แชร์",
                        color: Colors.grey.shade700,
                        enabled: !isBlocked,
                        onTap: onShare,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

// Expandable text widget
class _ExpandableText extends StatefulWidget {
  final String text;
  final int maxLines;

  const _ExpandableText({
    required this.text,
    required this.maxLines,
  });

  @override
  State<_ExpandableText> createState() => _ExpandableTextState();
}

class _ExpandableTextState extends State<_ExpandableText> {
  bool isExpanded = false;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          widget.text,
          maxLines: isExpanded ? null : widget.maxLines,
          overflow: isExpanded ? TextOverflow.visible : TextOverflow.ellipsis,
          style: const TextStyle(
            fontSize: 15,
            color: Colors.black87,
            height: 1.4,
          ),
        ),
        if (widget.text.split('\n').length > widget.maxLines ||
            widget.text.length > 200)
          GestureDetector(
            onTap: () => setState(() => isExpanded = !isExpanded),
            child: Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                isExpanded ? 'ซ่อน' : 'ดูเพิ่มเติม',
                style: const TextStyle(
                  fontSize: 13,
                  color: Color(0xFF3B6FD4),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

// Image grid
class ImageGrid extends StatelessWidget {
  final List<String> images;
  final Function(List<String>, int)? onImageTap;

  const ImageGrid({
    required this.images,
    this.onImageTap,
  });

  @override
  Widget build(BuildContext context) {
    final n = images.length;

    Widget cell(String url, int i, {double height = 220}) => GestureDetector(
      onTap: () => onImageTap?.call(images, i),
      child: SizedBox(
        height: height,
        width: double.infinity,
        child: Image.network(
          url,
          fit: BoxFit.cover,
          loadingBuilder: (_, child, p) => p == null
              ? child
              : Container(
                  color: Colors.grey.shade200,
                  child: const Center(
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
          errorBuilder: (_, __, ___) => Container(
            color: Colors.grey.shade200,
            child: const Icon(Icons.broken_image, color: Colors.grey),
          ),
        ),
      ),
    );

    if (n == 1) return cell(images[0], 0, height: 300);

    if (n == 2)
      return SizedBox(
        height: 220,
        child: Row(
          children: [
            Expanded(child: cell(images[0], 0, height: 220)),
            const SizedBox(width: 2),
            Expanded(child: cell(images[1], 1, height: 220)),
          ],
        ),
      );

    if (n == 3)
      return SizedBox(
        height: 220,
        child: Row(
          children: [
            Expanded(flex: 2, child: cell(images[0], 0, height: 220)),
            const SizedBox(width: 2),
            Expanded(
              child: Column(
                children: [
                  Expanded(child: cell(images[1], 1, height: 109)),
                  const SizedBox(height: 2),
                  Expanded(child: cell(images[2], 2, height: 109)),
                ],
              ),
            ),
          ],
        ),
      );

    if (n == 4)
      return SizedBox(
        height: 220,
        child: Column(
          children: [
            Expanded(
              child: Row(
                children: [
                  Expanded(child: cell(images[0], 0, height: 109)),
                  const SizedBox(width: 2),
                  Expanded(child: cell(images[1], 1, height: 109)),
                ],
              ),
            ),
            const SizedBox(height: 2),
            Expanded(
              child: Row(
                children: [
                  Expanded(child: cell(images[2], 2, height: 109)),
                  const SizedBox(width: 2),
                  Expanded(child: cell(images[3], 3, height: 109)),
                ],
              ),
            ),
          ],
        ),
      );

    // 5+
    return SizedBox(
      height: 220,
      child: Column(
        children: [
          Expanded(
            child: Row(
              children: [
                Expanded(child: cell(images[0], 0, height: 109)),
                const SizedBox(width: 2),
                Expanded(child: cell(images[1], 1, height: 109)),
              ],
            ),
          ),
          const SizedBox(height: 2),
          Expanded(
            child: Row(
              children: [
                Expanded(child: cell(images[2], 2, height: 109)),
                const SizedBox(width: 2),
                Expanded(child: cell(images[3], 3, height: 109)),
                const SizedBox(width: 2),
                Expanded(
                  child: GestureDetector(
                    onTap: () => onImageTap?.call(images, 4),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        Image.network(images[4], fit: BoxFit.cover),
                        Container(
                          color: Colors.black54,
                          child: Center(
                            child: Text(
                              "+${n - 4}",
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 22,
                                fontWeight: FontWeight.bold,
                              ),
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
        ],
      ),
    );
  }
}

// ── Article card (แสดงเมื่อ post แนบบทความ ไม่มีปุ่ม like/comment/share/อ่านเพิ่มเติม) ──
class _ArticleCard extends StatelessWidget {
  final Map article;
  final String phoneNumber;
  const _ArticleCard({required this.article, required this.phoneNumber});

  static const Map<String, Color> _catColors = {
    'สุขภาพ':    Color(0xFF1B5E20),
    'โภชนาการ':  Color(0xFF2E7D32),
    'สมาธิ':     Color(0xFF0277BD),
    'จิตใจ':     Color(0xFF6A1B9A),
  };

  @override
  Widget build(BuildContext context) {
    final String? coverUrl = article['cover_image_url'] as String?;
    final String title     = article['title']?.toString() ?? '';
    final String author    = article['author_name']?.toString() ?? '';
    final String summary   = article['summary']?.toString() ?? '';
    final String category  = article['category']?.toString() ?? '';
    final Color  catColor  = _catColors[category] ?? const Color(0xFF1565C0);

    final int articleId = (article['article_id'] as num?)?.toInt() ?? 0;

    return GestureDetector(
      onTap: articleId > 0
          ? () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => ArticleDetailPage(
                    articleId: articleId,
                    phoneNumber: phoneNumber.isNotEmpty ? phoneNumber : null,
                  ),
                ),
              )
          : null,
      child: Container(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(12),
        color: Colors.white,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // รูปปก
          if (coverUrl != null && coverUrl.isNotEmpty)
            ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
              child: Image.network(
                coverUrl,
                height: 160,
                width: double.infinity,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const SizedBox.shrink(),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // หมวดหมู่ chip
                if (category.isNotEmpty)
                  Container(
                    margin: const EdgeInsets.only(bottom: 6),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: catColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: catColor.withValues(alpha: 0.4)),
                    ),
                    child: Text(
                      category,
                      style: TextStyle(
                        fontSize: 11,
                        color: catColor,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                // ชื่อบทความ
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Colors.black87,
                    height: 1.35,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                // ผู้เขียน
                if (author.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      'โดย $author',
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                // เรื่องย่อ
                if (summary.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      summary,
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey.shade600,
                        height: 1.4,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
      ),    // closes Container (child of GestureDetector)
    );      // closes GestureDetector
  }
}

// Shared post preview
class _SharedPostPreview extends StatelessWidget {
  final Map post;

  const _SharedPostPreview({
    required this.post,
  });

  @override
  Widget build(BuildContext context) {
    final String? avatarUrl = post['profile_picture_url'] as String?;
    final List images = post['images'] ?? [];

    return GestureDetector(
      child: Container(
        margin: const EdgeInsets.fromLTRB(12, 8, 12, 4),
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
                    backgroundImage: avatarUrl != null
                        ? NetworkImage(avatarUrl)
                        : null,
                    child: avatarUrl == null
                        ? Text(
                            (post['full_name'] ?? '?')
                                .toString()
                                .substring(0, 1)
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
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          post['full_name'] ?? '',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                          ),
                        ),
                        Row(
                          children: [
                            Text(
                              PostCard.formatTimeAgo(post['created_at']),
                              style: TextStyle(
                                fontSize: 11,
                                color: Colors.grey.shade600,
                              ),
                            ),
                            const SizedBox(width: 3),
                            Icon(
                              PostCard.getVisibilityIcon(post['visibility']),
                              size: 10,
                              color: Colors.grey.shade600,
                            ),
                          ],
                        ),
                      ],
                    ),
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
                  height: 180,
                  width: double.infinity,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const SizedBox(),
                ),
              ),
            if (images.isEmpty && (post['content'] ?? '').isEmpty)
              const SizedBox(height: 4),
          ],
        ),
      ),
    );
  }
}

// Action button
class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  final bool enabled;

  const _ActionButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: enabled ? onTap : null,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: enabled ? color : Colors.grey.shade400, size: 20),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: enabled ? color : Colors.grey.shade400,
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
