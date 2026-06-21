import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'services/api_service.dart';
import 'services/app_config.dart';
import 'services/app_settings_service.dart';
import 'services/tts_stt_service.dart';

class ArticleDetailPage extends StatefulWidget {
  final int articleId;
  final String? phoneNumber;
  const ArticleDetailPage({super.key, required this.articleId, this.phoneNumber});

  @override
  State<ArticleDetailPage> createState() => _ArticleDetailPageState();
}

class _ArticleDetailPageState extends State<ArticleDetailPage> {
  Map<String, dynamic>? _article;
  bool _loading = true;
  bool _ttsPlaying = false;
  bool _ttsLoading = false;
  final TtsSttService _tts = TtsSttService.instance;

  // Interaction state
  bool _liked = false;
  int _likeCount = 0;
  int _commentCount = 0;

  // Comments
  List<Map<String, dynamic>> _comments = [];
  bool _showComments = false;
  bool _loadingComments = false;
  final TextEditingController _commentCtrl = TextEditingController();
  bool _submittingComment = false;

  @override
  void initState() {
    super.initState();
    _load();
    ApiService.viewArticle(widget.articleId);
    AppSettingsService.instance.load(userKey: widget.phoneNumber);
  }

  @override
  void dispose() {
    _tts.stop();
    _commentCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final data = await ApiService.getArticleById(
      widget.articleId,
      phone: widget.phoneNumber,
    );
    if (mounted) {
      setState(() {
        _article = data;
        _loading = false;
        if (data != null) {
          _liked = (data['user_liked'] as int? ?? 0) == 1;
          _likeCount = data['like_count'] as int? ?? 0;
          _commentCount = data['comment_count'] as int? ?? 0;
        }
      });
    }
  }

  Future<void> _toggleLike() async {
    if (widget.phoneNumber == null) return;
    // Optimistic update
    setState(() {
      _liked = !_liked;
      _likeCount += _liked ? 1 : -1;
    });
    final result = await ApiService.likeArticle(
        widget.articleId, widget.phoneNumber!);
    if (mounted && result.isNotEmpty) {
      setState(() {
        _liked = result['liked'] as bool? ?? _liked;
        _likeCount = result['like_count'] as int? ?? _likeCount;
      });
    }
  }

  Future<void> _handleShare() async {
    final a = _article;
    if (a == null) return;
    if (!mounted) return;
    final isElder = AppSettingsService.instance.elderModeNotifier.value;
    await showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _ShareSheet(
        article: a,
        isElder: isElder,
        onShareExternal: _shareExternal,
        onShareComm: widget.phoneNumber != null ? _shareToComm : null,
      ),
    );
  }

  Future<void> _shareExternal() async {
    final a = _article;
    if (a == null) return;
    final text =
        '${a['title']}\n\n${a['summary'] ?? ''}\n\nอ่านเพิ่มเติมใน EldersSpace';
    await Share.share(text);
    _incrementShareCount();
  }

  Future<void> _shareToComm() async {
    final a = _article;
    if (a == null || widget.phoneNumber == null) return;
    final noteCtrl = TextEditingController();
    final isElder = AppSettingsService.instance.elderModeNotifier.value;
    if (!mounted) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('แชร์ไปชุมชน', style: TextStyle(fontSize: isElder ? 20 : 17, fontWeight: FontWeight.bold)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('บทความ: ${a['title']}',
                  style: TextStyle(fontSize: isElder ? 15 : 13, color: Colors.grey[700]),
                  maxLines: 2, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 12),
              TextField(
                controller: noteCtrl,
                style: TextStyle(fontSize: isElder ? 16 : 14),
                maxLines: 3,
                decoration: InputDecoration(
                  hintText: 'เพิ่มข้อความ (ไม่บังคับ)',
                  hintStyle: TextStyle(fontSize: isElder ? 15 : 13, color: Colors.grey),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('ยกเลิก', style: TextStyle(fontSize: isElder ? 16 : 14)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF1565C0),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('โพสต์', style: TextStyle(fontSize: isElder ? 16 : 14, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    final note = noteCtrl.text.trim();
    // content เป็นแค่ข้อความที่ user พิมพ์เอง (card บทความจะแสดงแยก)
    final ok = await ApiService.createTextPost(
      widget.phoneNumber!,
      note,
      articleId: a['article_id'] as int?,
    );
    if (!mounted) return;
    if (ok) {
      ApiService.shareArticle(widget.articleId);
      _incrementShareCount();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('แชร์ไปชุมชนแล้ว'),
          backgroundColor: Color(0xFF1565C0),
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('แชร์ไม่สำเร็จ กรุณาลองใหม่')),
      );
    }
  }

  void _incrementShareCount() {
    if (mounted) {
      setState(() {
        final current = _article?['share_count'] as int? ?? 0;
        _article?['share_count'] = current + 1;
      });
    }
  }

  Future<void> _loadComments() async {
    setState(() { _loadingComments = true; _showComments = true; });
    final data = await ApiService.getArticleComments(widget.articleId);
    if (mounted) setState(() { _comments = data; _loadingComments = false; });
  }

  Future<void> _submitComment() async {
    final text = _commentCtrl.text.trim();
    if (text.isEmpty || widget.phoneNumber == null) return;
    setState(() => _submittingComment = true);
    final result = await ApiService.addArticleComment(
        widget.articleId, widget.phoneNumber!, text);
    if (mounted) {
      if (result['comment_id'] != null) {
        _commentCtrl.clear();
        setState(() {
          _comments.add(Map<String, dynamic>.from(result));
          _commentCount++;
          _submittingComment = false;
        });
      } else {
        setState(() => _submittingComment = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('ส่งความคิดเห็นไม่สำเร็จ')),
        );
      }
    }
  }

  Future<void> _deleteComment(int commentId) async {
    if (widget.phoneNumber == null) return;
    final ok = await ApiService.deleteArticleComment(
        widget.articleId, commentId, widget.phoneNumber!);
    if (ok && mounted) {
      setState(() {
        _comments.removeWhere((c) => c['comment_id'] == commentId);
        _commentCount = (_commentCount - 1).clamp(0, 99999);
      });
    }
  }

  Future<void> _toggleTts() async {
    if (_ttsPlaying) {
      await _tts.stop();
      if (mounted) setState(() { _ttsPlaying = false; _ttsLoading = false; });
      return;
    }
    final a = _article;
    if (a == null) return;
    final text = [
      a['title'], a['headline'], a['introduction'], a['body'], a['conclusion'],
    ].where((s) => s != null && s.toString().isNotEmpty).join('. ');

    if (mounted) setState(() => _ttsLoading = true);

    final ok = await _tts.speak(
      text: text,
      id: 'article_${widget.articleId}',
      onStart: (_) {
        if (mounted) setState(() { _ttsLoading = false; _ttsPlaying = true; });
      },
      onDone: (_) {
        if (mounted) setState(() { _ttsPlaying = false; _ttsLoading = false; });
      },
      onError: (_, message) {
        if (mounted) {
          setState(() { _ttsPlaying = false; _ttsLoading = false; });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('TTS Error: $message'),
              backgroundColor: Colors.red,
              duration: const Duration(seconds: 6),
            ),
          );
        }
      },
    );
    // กรณีที่ play สำเร็จทันที (เช่น toggle ซ้ำ) ให้ clear loading
    if (!ok && mounted) setState(() => _ttsLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: AppSettingsService.instance.elderModeNotifier,
      builder: (context, isElder, _) {
        return Scaffold(
          backgroundColor: Colors.white,
          body: _loading
              ? const Center(child: CircularProgressIndicator(color: Color(0xFF2E7D32)))
              : _article == null
                  ? _buildError()
                  : _buildContent(isElder),
        );
      },
    );
  }

  Widget _buildError() {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF1565C0),
        foregroundColor: Colors.white,
      ),
      body: const Center(child: Text('ไม่พบบทความ')),
    );
  }

  Widget _buildContent(bool isElder) {
    final a = _article!;
    final isPartner = a['source_type'] == 'partner';
    final badgeLabel = a['badge_label']?.toString() ??
        (isPartner ? 'ได้รับการสนับสนุน' : 'นักเขียนมือทอง');
    final authorDisplay = isPartner
        ? (a['partner_name']?.toString() ?? a['author_name']?.toString() ?? '')
        : (a['submitter_name']?.toString() ?? a['author_name']?.toString() ?? '');
    final coverUrl = _resolveImageUrl(a['cover_image']);

    return CustomScrollView(
      slivers: [
        SliverAppBar(
          backgroundColor: const Color(0xFF1565C0),
          foregroundColor: Colors.white,
          expandedHeight: coverUrl.isNotEmpty ? 260 : 0,
          pinned: true,
          actions: [
            IconButton(
              icon: _ttsLoading
                  ? const SizedBox(
                      width: 20, height: 20,
                      child: CircularProgressIndicator(
                          color: Colors.white, strokeWidth: 2),
                    )
                  : Icon(_ttsPlaying ? Icons.stop : Icons.volume_up_outlined),
              tooltip: _ttsPlaying ? 'หยุดอ่าน' : 'อ่านออกเสียง',
              onPressed: _ttsLoading ? null : _toggleTts,
            ),
          ],
          flexibleSpace: coverUrl.isNotEmpty
              ? FlexibleSpaceBar(
                  background: Stack(
                    fit: StackFit.expand,
                    children: [
                      Image.network(
                        coverUrl,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) =>
                            Container(color: const Color(0xFF1565C0)),
                      ),
                      Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              Colors.transparent,
                              Colors.black.withValues(alpha: 0.5),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                )
              : null,
        ),
        SliverToBoxAdapter(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Badge + author
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(
                            color: isPartner
                                ? const Color(0xFFE8F5E9)
                                : const Color(0xFFFFF3E0),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            isPartner ? Icons.favorite : Icons.emoji_events,
                            size: 16,
                            color: isPartner
                                ? const Color(0xFF1565C0)
                                : Colors.orange,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              badgeLabel,
                              style: TextStyle(
                                fontSize: isElder ? 13 : 11,
                                fontWeight: FontWeight.w600,
                                color: isPartner
                                    ? const Color(0xFF1565C0)
                                    : Colors.orange[700],
                              ),
                            ),
                            Text(
                              'โดย $authorDisplay',
                              style: TextStyle(
                                fontSize: isElder ? 12 : 11,
                                color: Colors.grey[600],
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    if ((a['approved_at']?.toString() ?? '').isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Icon(Icons.check_circle_outline,
                              size: 13, color: Colors.green[600]),
                          const SizedBox(width: 4),
                          Text(
                            'เผยแพร่เมื่อ ${_formatApprovedAt(a['approved_at'].toString())}',
                            style: TextStyle(
                              fontSize: isElder ? 12 : 11,
                              color: Colors.green[600],
                            ),
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 16),

                    // Title
                    Text(
                      a['title']?.toString() ?? '',
                      style: TextStyle(
                        fontSize: isElder ? 24 : 20,
                        fontWeight: FontWeight.bold,
                        height: 1.3,
                      ),
                    ),
                    if ((a['headline']?.toString() ?? '').isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        a['headline'].toString(),
                        style: TextStyle(
                          fontSize: isElder ? 17 : 15,
                          color: const Color(0xFF1565C0),
                          fontWeight: FontWeight.w500,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ],

                    const SizedBox(height: 16),

                    // Stats row
                    Row(
                      children: [
                        Icon(Icons.remove_red_eye_outlined,
                            size: 15, color: Colors.grey),
                        const SizedBox(width: 4),
                        Text('${a['view_count'] ?? 0}',
                            style: TextStyle(
                                fontSize: isElder ? 13 : 11,
                                color: Colors.grey)),
                        const SizedBox(width: 12),
                        Icon(Icons.favorite_border, size: 15, color: Colors.grey),
                        const SizedBox(width: 4),
                        Text('$_likeCount',
                            style: TextStyle(
                                fontSize: isElder ? 13 : 11,
                                color: Colors.grey)),
                        const SizedBox(width: 12),
                        Icon(Icons.chat_bubble_outline,
                            size: 15, color: Colors.grey),
                        const SizedBox(width: 4),
                        Text('$_commentCount',
                            style: TextStyle(
                                fontSize: isElder ? 13 : 11,
                                color: Colors.grey)),
                        const SizedBox(width: 12),
                        Icon(Icons.share_outlined, size: 15, color: Colors.grey),
                        const SizedBox(width: 4),
                        Text('${a['share_count'] ?? 0}',
                            style: TextStyle(
                                fontSize: isElder ? 13 : 11,
                                color: Colors.grey)),
                      ],
                    ),

                    const Divider(height: 28, color: Color(0xFFA5D6A7)),

                    // Article sections
                    if ((a['introduction']?.toString() ?? '').isNotEmpty) ...[
                      _buildSection('บทนำ', a['introduction'].toString(), isElder),
                      const SizedBox(height: 20),
                    ],
                    if ((a['body']?.toString() ?? '').isNotEmpty) ...[
                      _buildSection('เนื้อหา', a['body'].toString(), isElder),
                      const SizedBox(height: 20),
                    ],
                    if ((a['conclusion']?.toString() ?? '').isNotEmpty) ...[
                      _buildSection('สรุป', a['conclusion'].toString(), isElder,
                          isConclusion: true),
                      const SizedBox(height: 20),
                    ],
                  ],
                ),
              ),

              // ── Action bar ──
              Container(
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(color: Colors.grey.shade200),
                    bottom: BorderSide(color: Colors.grey.shade200),
                  ),
                  color: Colors.grey.shade50,
                ),
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _actionBtn(
                      icon: _liked ? Icons.favorite : Icons.favorite_border,
                      label: '$_likeCount',
                      color: _liked ? Colors.red : Colors.grey[600]!,
                      isElder: isElder,
                      onTap: _toggleLike,
                    ),
                    _actionBtn(
                      icon: Icons.chat_bubble_outline,
                      label: '$_commentCount',
                      color: Colors.grey[600]!,
                      isElder: isElder,
                      onTap: () {
                        if (!_showComments) _loadComments();
                        else setState(() => _showComments = false);
                      },
                    ),
                    _actionBtn(
                      icon: Icons.share_outlined,
                      label: '${a['share_count'] ?? 0}',
                      color: Colors.grey[600]!,
                      isElder: isElder,
                      onTap: _handleShare,
                    ),
                    _actionBtn(
                      icon: _ttsLoading
                          ? Icons.hourglass_top
                          : _ttsPlaying
                              ? Icons.stop
                              : Icons.volume_up_outlined,
                      label: _ttsLoading
                          ? 'กำลังโหลด'
                          : _ttsPlaying
                              ? 'หยุด'
                              : 'อ่านเสียง',
                      color: (_ttsPlaying || _ttsLoading)
                          ? const Color(0xFF1565C0)
                          : Colors.grey[600]!,
                      isElder: isElder,
                      onTap: _ttsLoading ? () {} : _toggleTts,
                    ),
                  ],
                ),
              ),

              // ── Comments section ──
              if (_showComments) _buildCommentsSection(isElder),

              const SizedBox(height: 32),
            ],
          ),
        ),
      ],
    );
  }

  Widget _actionBtn({
    required IconData icon,
    required String label,
    required Color color,
    required bool isElder,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: EdgeInsets.symmetric(
            horizontal: isElder ? 16 : 12, vertical: isElder ? 12 : 10),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: isElder ? 26 : 22, color: color),
            const SizedBox(height: 3),
            Text(label,
                style: TextStyle(
                    fontSize: isElder ? 13 : 11, color: color)),
          ],
        ),
      ),
    );
  }

  Widget _buildCommentsSection(bool isElder) {
    return Container(
      color: Colors.grey.shade50,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'ความคิดเห็น ($_commentCount)',
            style: TextStyle(
                fontSize: isElder ? 17 : 15, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),

          // Input
          if (widget.phoneNumber != null) ...[
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _commentCtrl,
                    style: TextStyle(fontSize: isElder ? 15 : 13),
                    decoration: InputDecoration(
                      hintText: 'แสดงความคิดเห็น...',
                      hintStyle: TextStyle(
                          fontSize: isElder ? 15 : 13, color: Colors.grey),
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 10),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide:
                            const BorderSide(color: Color(0xFFA5D6A7)),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide: const BorderSide(
                            color: Color(0xFF2E7D32), width: 1.5),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide:
                            const BorderSide(color: Color(0xFFBBDEFB)),
                      ),
                    ),
                    onSubmitted: (_) => _submitComment(),
                  ),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: _submittingComment ? null : _submitComment,
                  child: Container(
                    width: isElder ? 46 : 40,
                    height: isElder ? 46 : 40,
                    decoration: BoxDecoration(
                      color: _submittingComment
                          ? Colors.grey
                          : const Color(0xFF1565C0),
                      shape: BoxShape.circle,
                    ),
                    child: _submittingComment
                        ? const Padding(
                            padding: EdgeInsets.all(10),
                            child: CircularProgressIndicator(
                                color: Colors.white, strokeWidth: 2),
                          )
                        : const Icon(Icons.send,
                            color: Colors.white, size: 18),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
          ],

          // Comments list
          if (_loadingComments)
            const Center(
                child: CircularProgressIndicator(
                    color: Color(0xFF2E7D32)))
          else if (_comments.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Center(
                child: Text('ยังไม่มีความคิดเห็น',
                    style: TextStyle(
                        color: Colors.grey,
                        fontSize: isElder ? 14 : 12)),
              ),
            )
          else
            ..._comments.map((c) => _buildCommentRow(c, isElder)),
        ],
      ),
    );
  }

  Widget _buildCommentRow(Map<String, dynamic> c, bool isElder) {
    final avatarUrl = c['profile_picture_url']?.toString() ?? '';
    final isOwn = widget.phoneNumber != null;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: isElder ? 20 : 16,
            backgroundImage:
                avatarUrl.isNotEmpty ? NetworkImage(avatarUrl) : null,
            backgroundColor: const Color(0xFFE8F5E9),
            child: avatarUrl.isEmpty
                ? Icon(Icons.person,
                    size: isElder ? 20 : 16,
                    color: const Color(0xFF1565C0))
                : null,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey.shade200),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        c['full_name']?.toString() ?? 'ผู้ใช้',
                        style: TextStyle(
                          fontSize: isElder ? 14 : 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (isOwn)
                        GestureDetector(
                          onTap: () => _deleteComment(c['comment_id'] as int),
                          child: Icon(Icons.close,
                              size: 16, color: Colors.grey[400]),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    c['content']?.toString() ?? '',
                    style: TextStyle(
                        fontSize: isElder ? 14 : 13, height: 1.4),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSection(String label, String text, bool isElder,
      {bool isConclusion = false}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 4,
              height: 20,
              decoration: BoxDecoration(
                color: isConclusion
                    ? Colors.orange
                    : const Color(0xFF1565C0),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                fontSize: isElder ? 18 : 16,
                fontWeight: FontWeight.bold,
                color: isConclusion
                    ? Colors.orange[800]
                    : const Color(0xFF1565C0),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Text(
          text,
          style: TextStyle(
              fontSize: isElder ? 16 : 14,
              height: 1.7,
              color: Colors.grey[800]),
        ),
      ],
    );
  }

  String _formatApprovedAt(String raw) {
    final dt = DateTime.tryParse(raw);
    if (dt == null) return raw;
    final d = dt.day.toString().padLeft(2, '0');
    final m = dt.month.toString().padLeft(2, '0');
    final y = dt.year;
    final h = dt.hour.toString().padLeft(2, '0');
    final min = dt.minute.toString().padLeft(2, '0');
    return '$d/$m/$y $h:$min น.';
  }

  String _resolveImageUrl(dynamic raw) {
    if (raw == null || raw.toString().isEmpty) return '';
    final s = raw.toString();
    if (s.startsWith('http')) return s;
    final base = AppConfig.serverBaseUrl;
    return '$base/uploads/${s.replaceAll(RegExp(r'^/+'), '')}';
  }
}

class _ShareSheet extends StatelessWidget {
  final Map<String, dynamic> article;
  final bool isElder;
  final VoidCallback onShareExternal;
  final VoidCallback? onShareComm;

  const _ShareSheet({
    required this.article,
    required this.isElder,
    required this.onShareExternal,
    this.onShareComm,
  });

  @override
  Widget build(BuildContext context) {
    final fontSize = isElder ? 16.0 : 14.0;
    final iconSize = isElder ? 28.0 : 24.0;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(0, 8, 0, 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36,
              height: 4,
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Text(
                'แชร์บทความ',
                style: TextStyle(fontSize: isElder ? 18 : 16, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(height: 16),
            ListTile(
              leading: Container(
                width: iconSize + 16,
                height: iconSize + 16,
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.share_outlined, size: iconSize, color: Colors.grey[700]),
              ),
              title: Text('แชร์ออกนอกแอป', style: TextStyle(fontSize: fontSize, fontWeight: FontWeight.w600)),
              subtitle: Text('ส่งให้เพื่อนผ่าน LINE, Facebook ฯลฯ',
                  style: TextStyle(fontSize: isElder ? 13 : 12, color: Colors.grey)),
              onTap: () {
                Navigator.pop(context);
                onShareExternal();
              },
            ),
            if (onShareComm != null)
              ListTile(
                leading: Container(
                  width: iconSize + 16,
                  height: iconSize + 16,
                  decoration: const BoxDecoration(
                    color: Color(0xFFE8F0FE),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.people_alt_outlined, size: iconSize, color: Color(0xFF1565C0)),
                ),
                title: Text('แชร์ไปชุมชน', style: TextStyle(fontSize: fontSize, fontWeight: FontWeight.w600)),
                subtitle: Text('โพสต์บทความนี้ในหน้าชุมชนของคุณ',
                    style: TextStyle(fontSize: isElder ? 13 : 12, color: Colors.grey)),
                onTap: () {
                  Navigator.pop(context);
                  onShareComm!();
                },
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}
