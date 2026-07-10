import 'package:flutter/material.dart';
import 'services/api_service.dart';
import 'services/app_config.dart';
import 'services/app_settings_service.dart';
import 'article_detail_page.dart';
import 'write_article_page.dart';
import 'ranking_page.dart';

class HealthPage extends StatefulWidget {
  final String phoneNumber;
  final String? initialCategory;
  const HealthPage({super.key, required this.phoneNumber, this.initialCategory});

  @override
  State<HealthPage> createState() => _HealthPageState();
}

class _HealthPageState extends State<HealthPage> {
  static const _cats = ['สุขภาพ', 'โภชนาการ', 'สมาธิ', 'จิตใจ'];

  late String _selectedCat;
  List<Map<String, dynamic>> _articles = [];
  bool _loading = true;
  bool _loadError = false;

  @override
  void initState() {
    super.initState();
    _selectedCat = widget.initialCategory ?? 'สุขภาพ';
    _fetchArticles();
  }

  Future<void> _fetchArticles() async {
    setState(() { _loading = true; _loadError = false; });
    final data = await ApiService.getArticles(
      category: _selectedCat,
      phone: widget.phoneNumber,
    );
    if (mounted) {
      setState(() {
        _articles = data;
        _loading = false;
      });
    }
  }

  void _changeCategory(String cat) {
    if (_selectedCat == cat) return;
    setState(() => _selectedCat = cat);
    _fetchArticles();
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
            title: const Text('สุขภาพการดูแลตัวเอง',
                style: TextStyle(fontWeight: FontWeight.bold)),
            elevation: 0,
            actions: [
              IconButton(
                icon: const Icon(Icons.emoji_events),
                tooltip: 'อันดับนักเขียน',
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const RankingPage()),
                ),
              ),
            ],
          ),
          body: Column(
            children: [
              _buildCategoryTabs(isElder),
              Expanded(
                child: _loading
                    ? const Center(child: CircularProgressIndicator(color: Color(0xFF1565C0)))
                    : _articles.isEmpty
                        ? _buildEmpty()
                        : RefreshIndicator(
                            color: const Color(0xFF1565C0),
                            onRefresh: _fetchArticles,
                            child: ListView.builder(
                              padding: const EdgeInsets.fromLTRB(16, 12, 16, 80),
                              itemCount: _articles.length,
                              itemBuilder: (ctx, i) =>
                                  _buildArticleCard(_articles[i], isElder),
                            ),
                          ),
              ),
            ],
          ),
          floatingActionButton: FloatingActionButton.extended(
            backgroundColor: const Color(0xFF1565C0),
            foregroundColor: Colors.white,
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => WriteArticlePage(
                  phoneNumber: widget.phoneNumber,
                  initialCategory: _selectedCat,
                ),
              ),
            ).then((_) => _fetchArticles()),
            icon: const Icon(Icons.edit),
            label: const Text('เขียนบทความ'),
          ),
        );
      },
    );
  }

  Widget _buildCategoryTabs(bool isElder) {
    return Container(
      color: const Color(0xFF1565C0),
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      child: Row(
        children: _cats.map((cat) {
          final active = cat == _selectedCat;
          final isLast = cat == _cats.last;
          return Expanded(
            child: Padding(
              padding: EdgeInsets.only(right: isLast ? 0 : 8),
              child: GestureDetector(
                onTap: () => _changeCategory(cat),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: EdgeInsets.symmetric(vertical: isElder ? 10 : 8),
                  decoration: BoxDecoration(
                    color: active ? Colors.white : Colors.white.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      cat,
                      maxLines: 1,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: active ? const Color(0xFF1565C0) : Colors.white,
                        fontWeight: active ? FontWeight.bold : FontWeight.normal,
                        fontSize: isElder ? 15 : 13,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildArticleCard(Map<String, dynamic> a, bool isElder) {
    final isPartner = a['source_type'] == 'partner';
    final badgeLabel = a['badge_label']?.toString() ?? (isPartner ? 'ได้รับการสนับสนุน' : 'นักเขียนมือทอง');
    final authorDisplay = isPartner
        ? (a['partner_name']?.toString() ?? a['author_name']?.toString() ?? '')
        : (a['author_name']?.toString() ?? '');
    final coverUrl = _resolveImageUrl(a['cover_image']);
    final isFeatured = _toInt(a['is_featured']) == 1;
    final accentColor = isPartner ? const Color(0xFF1565C0) : Colors.orange;
    final onTap = () => Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ArticleDetailPage(
              articleId: _toInt(a['article_id']),
              phoneNumber: widget.phoneNumber,
            ),
          ),
        ).then((_) => _fetchArticles());

    return _buildElderCard(a, isPartner, badgeLabel, authorDisplay, coverUrl,
        isFeatured, accentColor, onTap);
  }

  Widget _buildElderCard(
    Map<String, dynamic> a,
    bool isPartner,
    String badgeLabel,
    String authorDisplay,
    String coverUrl,
    bool isFeatured,
    Color accentColor,
    VoidCallback onTap,
  ) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: accentColor, width: 2),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.07),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(5),
                    decoration: BoxDecoration(
                      color: isPartner ? const Color(0xFFE8F5E9) : const Color(0xFFFFF3E0),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(isPartner ? Icons.favorite : Icons.emoji_events,
                        size: 14, color: accentColor),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(badgeLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: accentColor)),
                        Text('โดย $authorDisplay',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            if (coverUrl.isNotEmpty)
              ClipRRect(
                borderRadius: BorderRadius.zero,
                child: Image.network(
                  coverUrl,
                  width: double.infinity,
                  height: 190,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    a['title']?.toString() ?? '',
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, height: 1.3),
                  ),
                  if ((a['summary']?.toString() ?? '').isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      a['summary'].toString(),
                      style: TextStyle(fontSize: 15, color: Colors.grey[700], height: 1.5),
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 0),
              child: _buildStats(a, 13),
            ),
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: onTap,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1565C0),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
                    elevation: 0,
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('อ่านบทความฉบับเต็ม',
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                      SizedBox(width: 6),
                      Text('→', style: TextStyle(fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCompactCard(
    Map<String, dynamic> a,
    bool isPartner,
    String badgeLabel,
    String authorDisplay,
    String coverUrl,
    bool isFeatured,
    Color accentColor,
    VoidCallback onTap,
  ) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Thumbnail
            ClipRRect(
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(12),
                bottomLeft: Radius.circular(12),
              ),
              child: coverUrl.isNotEmpty
                  ? Image.network(
                      coverUrl,
                      width: 100,
                      height: 110,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => _placeholderThumb(accentColor),
                    )
                  : _placeholderThumb(accentColor),
            ),
            // Content
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Badge
                    Row(
                      children: [
                        Icon(isPartner ? Icons.favorite : Icons.emoji_events,
                            size: 11, color: accentColor),
                        const SizedBox(width: 3),
                        Expanded(
                          child: Text(
                            '$badgeLabel · $authorDisplay',
                            style: TextStyle(fontSize: 10, color: accentColor, fontWeight: FontWeight.w600),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 5),
                    Text(
                      a['title']?.toString() ?? '',
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, height: 1.3),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if ((a['summary']?.toString() ?? '').isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        a['summary'].toString(),
                        style: TextStyle(fontSize: 12, color: Colors.grey[600], height: 1.4),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                    const SizedBox(height: 8),
                    _buildStats(a, 11),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _placeholderThumb(Color accentColor) {
    return Container(
      width: 100,
      height: 110,
      color: accentColor.withValues(alpha: 0.08),
      child: Icon(Icons.article_outlined, size: 32, color: accentColor.withValues(alpha: 0.4)),
    );
  }

  Widget _buildStats(Map<String, dynamic> a, double fontSize) {
    return Row(
      children: [
        Icon(
          _toInt(a['user_liked']) == 1 ? Icons.favorite : Icons.favorite_border,
          size: 14,
          color: _toInt(a['user_liked']) == 1 ? Colors.red : Colors.grey,
        ),
        const SizedBox(width: 3),
        Text('${a['like_count'] ?? 0}',
            style: TextStyle(fontSize: fontSize, color: Colors.grey[700])),
        const SizedBox(width: 10),
        Icon(Icons.chat_bubble_outline, size: 14, color: Colors.grey),
        const SizedBox(width: 3),
        Text('${a['comment_count'] ?? 0}',
            style: TextStyle(fontSize: fontSize, color: Colors.grey[700])),
        const SizedBox(width: 10),
        Icon(Icons.remove_red_eye_outlined, size: 14, color: Colors.grey),
        const SizedBox(width: 3),
        Text('${a['view_count'] ?? 0}',
            style: TextStyle(fontSize: fontSize, color: Colors.grey[700])),
      ],
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.article_outlined, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            Text(
              'ยังไม่มีบทความในหมวด $_selectedCat',
              style: TextStyle(fontSize: 16, color: Colors.grey[600]),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'เป็นคนแรกที่แบ่งปันความรู้!',
              style: TextStyle(fontSize: 14, color: Colors.grey[500]),
            ),
            const SizedBox(height: 20),
            OutlinedButton.icon(
              onPressed: _fetchArticles,
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('โหลดใหม่'),
              style: OutlinedButton.styleFrom(
                foregroundColor: const Color(0xFF1565C0),
                side: const BorderSide(color: Color(0xFF1565C0)),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  int _toInt(dynamic v) {
    if (v is int) return v;
    if (v is num) return v.toInt();
    return int.tryParse(v?.toString() ?? '') ?? 0;
  }

  String _resolveImageUrl(dynamic raw) {
    if (raw == null || raw.toString().isEmpty) return '';
    final s = raw.toString();
    if (s.startsWith('http')) return s;
    final base = AppConfig.serverBaseUrl;
    return '$base/uploads/${s.replaceAll(RegExp(r'^/+'), '')}';
  }
}
