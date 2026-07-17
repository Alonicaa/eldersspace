import 'package:flutter/material.dart';
import 'services/partner_service.dart';
import 'partner_page.dart';

class AllAnnouncementsPage extends StatefulWidget {
  const AllAnnouncementsPage({super.key});

  @override
  State<AllAnnouncementsPage> createState() => _AllAnnouncementsPageState();
}

class _AllAnnouncementsPageState extends State<AllAnnouncementsPage> {
  List<Map<String, dynamic>> _banners = [];
  bool _loading = true;

  static String _clean(String s) => s
      .replaceAll(r'\r\n', '\n')
      .replaceAll(r'\n', '\n')
      .replaceAll(r'\r', '\n')
      .trim();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final banners = await PartnerService.getHomeBanners(type: 'announcement');
    if (mounted) {
      setState(() { _banners = banners; _loading = false; });
      for (final b in banners) {
        final id = b['id'];
        if (id != null) PartnerService.trackBannerView(id as int);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F5),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1565C0),
        foregroundColor: Colors.white,
        title: const Text('ประชาสัมพันธ์', style: TextStyle(fontWeight: FontWeight.bold)),
        elevation: 0,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _banners.isEmpty
              ? _buildEmpty()
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _banners.length,
                  itemBuilder: (ctx, i) => _buildCard(_banners[i]),
                ),
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.campaign_outlined, size: 64, color: Colors.grey.shade400),
          const SizedBox(height: 12),
          Text('ไม่มีประชาสัมพันธ์ในขณะนี้', style: TextStyle(fontSize: 16, color: Colors.grey.shade600)),
        ],
      ),
    );
  }

  Widget _buildCard(Map<String, dynamic> b) {
    final imgUrl = PartnerService.resolveImageUrl(b['image_url']);
    final partnerId = b['partner_id'];
    final bannerId = b['id'];

    return GestureDetector(
      onTap: () {
        if (bannerId != null) PartnerService.trackBannerClick(bannerId as int);
        if (partnerId != null) {
          Navigator.push(context, MaterialPageRoute(builder: (_) => PartnerPage(partnerId: partnerId as int)));
        }
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.07), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (imgUrl.isNotEmpty)
              ClipRRect(
                borderRadius: const BorderRadius.vertical(top: Radius.circular(14)),
                child: Image.network(
                  imgUrl,
                  width: double.infinity,
                  height: 180,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    height: 120,
                    color: Colors.grey.shade100,
                    child: const Center(child: Icon(Icons.image, size: 40, color: Colors.grey)),
                  ),
                ),
              ),
            if ((b['title']?.toString() ?? '').isNotEmpty || (b['description']?.toString() ?? '').isNotEmpty)
              Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if ((b['title']?.toString() ?? '').isNotEmpty)
                      Text(
                        b['title'].toString(),
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                      ),
                    if ((b['description']?.toString() ?? '').isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        _clean(b['description'].toString()),
                        style: const TextStyle(fontSize: 13, color: Colors.grey, height: 1.5),
                        maxLines: 4,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                    if (b['partner_name'] != null) ...[
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          const Icon(Icons.store_outlined, size: 14, color: Color(0xFF1565C0)),
                          const SizedBox(width: 4),
                          Expanded(child: Text(b['partner_name'].toString(), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: Color(0xFF1565C0), fontWeight: FontWeight.w500))),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
