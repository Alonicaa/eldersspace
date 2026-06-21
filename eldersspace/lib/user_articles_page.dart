import 'package:flutter/material.dart';
import 'services/api_service.dart';
import 'services/app_settings_service.dart';
import 'article_detail_page.dart';

class UserArticlesPage extends StatefulWidget {
  final int userId;
  final String userName;

  const UserArticlesPage({
    super.key,
    required this.userId,
    required this.userName,
  });

  @override
  State<UserArticlesPage> createState() => _UserArticlesPageState();
}

class _UserArticlesPageState extends State<UserArticlesPage> {
  List<Map<String, dynamic>> _articles = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final data = await ApiService.getArticlesByUserId(widget.userId);
    if (mounted) setState(() { _articles = data; _loading = false; });
  }

  String _resolveImage(dynamic raw) {
    if (raw == null || raw.toString().isEmpty) return '';
    final s = raw.toString();
    if (s.startsWith('http')) return s;
    return '${ApiService.baseUrl.replaceFirst('/api', '')}/uploads/${s.replaceAll(RegExp(r'^/+'), '')}';
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: AppSettingsService.instance.elderModeNotifier,
      builder: (context, isElder, _) {
        return Scaffold(
          backgroundColor: const Color(0xFFF5F5F5),
          appBar: AppBar(
            backgroundColor: const Color(0xFF1565C0),
            foregroundColor: Colors.white,
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.userName,
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: isElder ? 17 : 15,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  'บทความทั้งหมด',
                  style: TextStyle(
                    fontSize: isElder ? 12 : 11,
                    color: Colors.white70,
                  ),
                ),
              ],
            ),
            elevation: 0,
          ),
          body: _loading
              ? const Center(child: CircularProgressIndicator(color: Color(0xFF1565C0)))
              : _articles.isEmpty
                  ? _buildEmpty(isElder)
                  : RefreshIndicator(
                      color: const Color(0xFF1565C0),
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _articles.length,
                        itemBuilder: (ctx, i) => _buildCard(_articles[i], isElder),
                      ),
                    ),
        );
      },
    );
  }

  Widget _buildCard(Map<String, dynamic> a, bool isElder) {
    final coverUrl = _resolveImage(a['cover_image']);
    final title = a['title']?.toString() ?? '';
    final summary = a['summary']?.toString() ?? '';

    return GestureDetector(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ArticleDetailPage(articleId: a['article_id'] as int),
        ),
      ),
      child: Container(
        margin: const EdgeInsets.only(bottom: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
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
            if (coverUrl.isNotEmpty)
              ClipRRect(
                borderRadius: const BorderRadius.vertical(top: Radius.circular(14)),
                child: Image.network(
                  coverUrl,
                  width: double.infinity,
                  height: 160,
                  fit: BoxFit.cover,
                  errorBuilder: (_, e, __) => const SizedBox.shrink(),
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
              child: Text(
                title,
                style: TextStyle(
                  fontSize: isElder ? 17 : 15,
                  fontWeight: FontWeight.bold,
                  height: 1.3,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (summary.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 4, 14, 4),
                child: Text(
                  summary,
                  style: TextStyle(
                    fontSize: isElder ? 14 : 12,
                    color: Colors.grey[600],
                    height: 1.4,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 8, 14, 12),
              child: Row(
                children: [
                  _stat(Icons.favorite, a['like_count'], Colors.red, isElder),
                  const SizedBox(width: 14),
                  _stat(Icons.share, a['share_count'], const Color(0xFF1565C0), isElder),
                  const SizedBox(width: 14),
                  _stat(Icons.comment_outlined, a['comment_count'], Colors.grey, isElder),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _stat(IconData icon, dynamic val, Color color, bool isElder) {
    final n = num.tryParse(val?.toString() ?? '0') ?? 0;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: isElder ? 15 : 13, color: color),
        const SizedBox(width: 3),
        Text(
          '$n',
          style: TextStyle(fontSize: isElder ? 13 : 11, color: Colors.grey[600]),
        ),
      ],
    );
  }

  Widget _buildEmpty(bool isElder) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.article_outlined, size: 64, color: Colors.grey[400]),
          const SizedBox(height: 16),
          Text(
            'ยังไม่มีบทความ',
            style: TextStyle(fontSize: isElder ? 17 : 15, color: Colors.grey[600]),
          ),
        ],
      ),
    );
  }
}
