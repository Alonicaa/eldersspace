import 'package:flutter/material.dart';
import 'services/api_service.dart';
import 'services/app_settings_service.dart';
import 'user_articles_page.dart';

class RankingPage extends StatefulWidget {
  const RankingPage({super.key});

  @override
  State<RankingPage> createState() => _RankingPageState();
}

class _RankingPageState extends State<RankingPage> {
  List<Map<String, dynamic>> _ranking = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final data = await ApiService.getArticleRanking(limit: 50);
    if (mounted) setState(() { _ranking = data; _loading = false; });
  }

  String _resolveImage(dynamic raw) {
    if (raw == null || raw.toString().isEmpty) return '';
    final s = raw.toString();
    if (s.startsWith('http')) return s;
    return '${ApiService.baseUrl.replaceFirst('/api', '')}/uploads/${s.replaceAll(RegExp(r'^/+'), '')}';
  }

  String _fmt(dynamic v) {
    final n = num.tryParse(v?.toString() ?? '0') ?? 0;
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}k';
    return n.toStringAsFixed(0);
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
            title: const Text('อันดับนักเขียน',
                style: TextStyle(fontWeight: FontWeight.bold)),
            elevation: 0,
          ),
          body: _loading
              ? const Center(
                  child: CircularProgressIndicator(color: Color(0xFF1565C0)))
              : _ranking.isEmpty
                  ? _buildEmpty(isElder)
                  : RefreshIndicator(
                      color: const Color(0xFF1565C0),
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 12),
                        itemCount: _ranking.length,
                        itemBuilder: (ctx, i) =>
                            _buildCard(i + 1, _ranking[i], isElder),
                      ),
                    ),
        );
      },
    );
  }

  Widget _buildCard(int rank, Map<String, dynamic> u, bool isElder) {
    final imgUrl = _resolveImage(u['profile_image']);
    final name = u['full_name']?.toString() ?? 'ผู้ใช้';
    final score = _fmt(u['score']);
    final userId = u['user_id'] as int? ?? 0;

    Color rankColor = Colors.grey[600]!;
    if (rank == 1) rankColor = const Color(0xFFFFD700);
    if (rank == 2) rankColor = const Color(0xFFC0C0C0);
    if (rank == 3) rankColor = const Color(0xFFCD7F32);

    return GestureDetector(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => UserArticlesPage(userId: userId, userName: name),
        ),
      ),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          children: [
            SizedBox(
              width: 36,
              child: Text(
                '#$rank',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: isElder ? 16 : 14,
                  fontWeight: FontWeight.bold,
                  color: rankColor,
                ),
              ),
            ),
            const SizedBox(width: 10),
            _buildAvatar(imgUrl, name, isElder ? 46 : 42),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                name,
                style: TextStyle(
                  fontSize: isElder ? 16 : 14,
                  fontWeight: FontWeight.bold,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: const Color(0xFFE3F2FD),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                '$score pt',
                style: TextStyle(
                  fontSize: isElder ? 13 : 12,
                  fontWeight: FontWeight.bold,
                  color: const Color(0xFF1565C0),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAvatar(String imgUrl, String name, double size) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.grey.shade200,
        border: Border.all(color: const Color(0xFF1565C0), width: 1.5),
      ),
      child: ClipOval(
        child: imgUrl.isNotEmpty
            ? Image.network(
                imgUrl,
                fit: BoxFit.cover,
                errorBuilder: (_, e, __) => _avatarFallback(name, size),
              )
            : _avatarFallback(name, size),
      ),
    );
  }

  Widget _avatarFallback(String name, double size) {
    return Container(
      color: const Color(0xFF1565C0),
      child: Center(
        child: Text(
          name.isNotEmpty ? name[0].toUpperCase() : '?',
          style: TextStyle(
            color: Colors.white,
            fontSize: size * 0.4,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    );
  }

  Widget _buildEmpty(bool isElder) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.emoji_events_outlined, size: 64, color: Colors.grey[400]),
          const SizedBox(height: 16),
          Text(
            'ยังไม่มีข้อมูลการจัดอันดับ',
            style: TextStyle(
                fontSize: isElder ? 17 : 15, color: Colors.grey[600]),
          ),
          const SizedBox(height: 8),
          Text(
            'เขียนบทความแรกของคุณได้เลย!',
            style: TextStyle(
                fontSize: isElder ? 15 : 13, color: Colors.grey[500]),
          ),
        ],
      ),
    );
  }
}
