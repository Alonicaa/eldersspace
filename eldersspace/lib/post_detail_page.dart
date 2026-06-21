import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'services/api_service.dart';
import 'widgets/post_component.dart';
import 'profile_page.dart';

class PostDetailPage extends StatefulWidget {
  final Map post;
  final String currentUserPhone;
  final VoidCallback? onPostChanged;

  const PostDetailPage({
    super.key,
    required this.post,
    required this.currentUserPhone,
    this.onPostChanged,
  });

  @override
  State<PostDetailPage> createState() => _PostDetailPageState();
}

class _PostDetailPageState extends State<PostDetailPage> {
  final String baseUrl = ApiService.baseUrl;
  final _commentController = TextEditingController();
  final _scrollController = ScrollController();
  final _commentFocus = FocusNode();

  List<Map<String, dynamic>> _comments = [];
  bool _loadingComments = true;
  bool _submitting = false;
  late Map _post;

  @override
  void initState() {
    super.initState();
    _post = Map.from(widget.post);
    _loadComments();
  }

  @override
  void dispose() {
    _commentController.dispose();
    _scrollController.dispose();
    _commentFocus.dispose();
    super.dispose();
  }

  Future<void> _loadComments() async {
    final postId = _post['post_id'];
    try {
      final res = await http.get(Uri.parse('$baseUrl/comments/$postId'));
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data is List && mounted) {
          setState(() {
            _comments = data
                .whereType<Map>()
                .map((e) => Map<String, dynamic>.from(e))
                .where((c) => c['is_deleted'] != 1 && c['is_deleted'] != '1')
                .toList();
            _loadingComments = false;
          });
          return;
        }
      }
    } catch (_) {}
    if (mounted) setState(() => _loadingComments = false);
  }

  Future<void> _submitComment() async {
    final text = _commentController.text.trim();
    if (text.isEmpty || _submitting) return;
    setState(() => _submitting = true);
    _commentController.clear();
    _commentFocus.unfocus();

    try {
      final postId = _post['post_id'];
      final res = await http.post(
        Uri.parse('$baseUrl/comments/$postId'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'phone': widget.currentUserPhone, 'content': text}),
      );
      if (res.statusCode == 403) {
        String msg = 'บัญชีนี้ถูกจำกัดการมีส่วนร่วมชั่วคราว';
        try {
          final d = jsonDecode(res.body);
          if (d is Map && (d['error'] ?? '').toString().isNotEmpty) {
            msg = d['error'].toString();
          }
        } catch (_) {}
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(msg)));
        }
      } else {
        await _loadComments();
        setState(() {
          _post['comments'] = _toInt(_post['comments']) + 1;
        });
        widget.onPostChanged?.call();
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (_scrollController.hasClients) {
            _scrollController.animateTo(
              _scrollController.position.maxScrollExtent,
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOut,
            );
          }
        });
      }
    } catch (_) {}
    if (mounted) setState(() => _submitting = false);
  }

  Future<void> _likePost() async {
    final postId = _post['post_id'];
    final liked = _post['user_like'] == 'like';
    setState(() {
      _post['user_like'] = liked ? null : 'like';
      _post['likes'] = _toInt(_post['likes']) + (liked ? -1 : 1);
    });
    try {
      await http.post(
        Uri.parse('$baseUrl/posts/$postId/like'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'phone': widget.currentUserPhone,
          'type': liked ? 'remove' : 'like',
        }),
      );
      widget.onPostChanged?.call();
    } catch (_) {}
  }

  int _toInt(dynamic v) {
    if (v is int) return v;
    if (v is num) return v.toInt();
    return int.tryParse(v?.toString() ?? '') ?? 0;
  }

  void _goToProfile(String phone) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ProfilePage(
          phoneNumber: phone,
          currentUserPhone: widget.currentUserPhone,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bool liked = _post['user_like'] == 'like';
    final int likeCount = _toInt(_post['likes']);
    final String? avatarUrl = _post['profile_picture_url'];

    return Scaffold(
      backgroundColor: const Color(0xFFEBECF0),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.black87),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'โพสต์',
          style: TextStyle(
            color: Colors.black87,
            fontWeight: FontWeight.bold,
            fontSize: 18,
          ),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              controller: _scrollController,
              children: [
                // ── Full post ──
                Container(
                  color: Colors.white,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Header
                      Padding(
                        padding: const EdgeInsets.fromLTRB(12, 12, 4, 8),
                        child: Row(
                          children: [
                            GestureDetector(
                              onTap: () => _goToProfile(
                                  _post['phone_number']?.toString() ?? ''),
                              child: CircleAvatar(
                                radius: 22,
                                backgroundColor: const Color(0xFFDDE3F0),
                                backgroundImage: avatarUrl != null
                                    ? NetworkImage(avatarUrl)
                                    : null,
                                child: avatarUrl == null
                                    ? Text(
                                        (_post['full_name'] ?? '?')
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
                            GestureDetector(
                              onTap: () => _goToProfile(
                                  _post['phone_number']?.toString() ?? ''),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _post['full_name']?.toString() ?? '',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 15,
                                      color: Colors.black87,
                                    ),
                                  ),
                                  Text(
                                    PostCard.formatTimeAgo(
                                        _post['created_at']?.toString()),
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: Colors.grey.shade600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      // Full content (no truncation)
                      if ((_post['content'] ?? '').toString().isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                          child: Text(
                            _post['content'].toString(),
                            style: const TextStyle(
                              fontSize: 16,
                              color: Colors.black87,
                              height: 1.5,
                            ),
                          ),
                        ),
                      // Images
                      if ((_post['images'] ?? []).isNotEmpty)
                        ImageGrid(
                          images:
                              List<String>.from(_post['images'] ?? []),
                        ),
                      // Counts row
                      if (likeCount > 0 || _comments.isNotEmpty)
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
                                  '$likeCount',
                                  style: TextStyle(
                                    color: Colors.grey.shade600,
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                              const Spacer(),
                              if (_comments.isNotEmpty)
                                Text(
                                  'ความคิดเห็น ${_comments.length}',
                                  style: TextStyle(
                                    color: Colors.grey.shade600,
                                    fontSize: 13,
                                  ),
                                ),
                            ],
                          ),
                        ),
                      // Divider
                      Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 8),
                        child: Divider(
                            height: 1, color: Colors.grey.shade200),
                      ),
                      // Action buttons
                      Padding(
                        padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
                        child: Row(
                          children: [
                            Expanded(
                              child: _ActionBtn(
                                icon: liked
                                    ? Icons.thumb_up
                                    : Icons.thumb_up_outlined,
                                label: 'ถูกใจ',
                                color: liked
                                    ? const Color(0xFF3B6FD4)
                                    : Colors.grey.shade700,
                                onTap: _likePost,
                              ),
                            ),
                            Expanded(
                              child: _ActionBtn(
                                icon: Icons.chat_bubble_outline,
                                label: 'ความคิดเห็น',
                                color: Colors.grey.shade700,
                                onTap: () {
                                  FocusScope.of(context)
                                      .requestFocus(_commentFocus);
                                },
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),

                // ── Comments section ──
                Container(
                  color: Colors.white,
                  padding: const EdgeInsets.fromLTRB(12, 14, 12, 14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'ความคิดเห็น',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: Colors.black87,
                        ),
                      ),
                      const SizedBox(height: 12),
                      if (_loadingComments)
                        const Center(
                          child: Padding(
                            padding: EdgeInsets.symmetric(vertical: 24),
                            child: CircularProgressIndicator(),
                          ),
                        )
                      else if (_comments.isEmpty)
                        Padding(
                          padding:
                              const EdgeInsets.symmetric(vertical: 24),
                          child: Center(
                            child: Text(
                              'ยังไม่มีความคิดเห็น\nเป็นคนแรกที่แสดงความคิดเห็น!',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: Colors.grey.shade500,
                                fontSize: 14,
                                height: 1.6,
                              ),
                            ),
                          ),
                        )
                      else
                        ..._comments.map(_buildCommentTile),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),

          // ── Pinned comment input ──
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(
                  top: BorderSide(color: Colors.grey.shade200)),
            ),
            padding: EdgeInsets.only(
              left: 12,
              right: 12,
              top: 8,
              bottom: MediaQuery.of(context).viewInsets.bottom + 8,
            ),
            child: SafeArea(
              top: false,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: TextField(
                      controller: _commentController,
                      focusNode: _commentFocus,
                      textInputAction: TextInputAction.send,
                      maxLines: 4,
                      minLines: 1,
                      onSubmitted: (_) => _submitComment(),
                      inputFormatters: [
                        LengthLimitingTextInputFormatter(2000)
                      ],
                      decoration: InputDecoration(
                        hintText: 'เขียนความคิดเห็น...',
                        hintStyle: TextStyle(
                          color: Colors.grey.shade500,
                          fontSize: 14,
                        ),
                        filled: true,
                        fillColor: Colors.grey.shade100,
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 10),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(20),
                          borderSide: BorderSide.none,
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(20),
                          borderSide: BorderSide.none,
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(20),
                          borderSide: const BorderSide(
                              color: Color(0xFF3B6FD4), width: 1.5),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  _submitting
                      ? const SizedBox(
                          width: 40,
                          height: 40,
                          child: Padding(
                            padding: EdgeInsets.all(8),
                            child: CircularProgressIndicator(
                                strokeWidth: 2),
                          ),
                        )
                      : GestureDetector(
                          onTap: _submitComment,
                          child: Container(
                            width: 40,
                            height: 40,
                            decoration: const BoxDecoration(
                              color: Color(0xFF3B6FD4),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.send,
                                color: Colors.white, size: 18),
                          ),
                        ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCommentTile(Map<String, dynamic> c) {
    final String? avatarUrl = c['profile_picture_url'];
    final String name =
        (c['full_name'] ?? c['name'] ?? '').toString();
    final String content = (c['content'] ?? '').toString();
    final String time =
        PostCard.formatTimeAgo(c['created_at']?.toString());

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: const Color(0xFFDDE3F0),
            backgroundImage:
                avatarUrl != null ? NetworkImage(avatarUrl) : null,
            child: avatarUrl == null
                ? Text(
                    name.isNotEmpty
                        ? name.substring(0, 1).toUpperCase()
                        : '?',
                    style: const TextStyle(
                      color: Color(0xFF3B6FD4),
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                    ),
                  )
                : null,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                          color: Colors.black87,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        content,
                        style: const TextStyle(
                          fontSize: 14,
                          color: Colors.black87,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ),
                if (time.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(left: 4, top: 3),
                    child: Text(
                      time,
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.grey.shade500,
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

class _ActionBtn extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _ActionBtn({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: color,
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
