import 'package:flutter/material.dart';
import 'services/partner_service.dart';
import 'partner_page.dart';

class AllPartnersPage extends StatefulWidget {
  const AllPartnersPage({super.key});

  @override
  State<AllPartnersPage> createState() => _AllPartnersPageState();
}

class _AllPartnersPageState extends State<AllPartnersPage> {
  List<Map<String, dynamic>> _partners = [];
  bool _loading = true;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final partners = await PartnerService.getPartners();
    if (mounted) setState(() { _partners = partners; _loading = false; });
  }

  static const _tierOrder = {'platinum': 0, 'gold': 1, 'silver': 2, 'none': 3};

  List<Map<String, dynamic>> get _filtered {
    var list = [..._partners];
    if (_searchQuery.isNotEmpty) {
      final q = _searchQuery.toLowerCase();
      list = list.where((p) =>
        (p['name']?.toString().toLowerCase().contains(q) ?? false) ||
        (p['description']?.toString().toLowerCase().contains(q) ?? false)
      ).toList();
    }
    list.sort((a, b) {
      final ta = _tierOrder[a['tier']?.toString() ?? 'none'] ?? 3;
      final tb = _tierOrder[b['tier']?.toString() ?? 'none'] ?? 3;
      return ta.compareTo(tb);
    });
    return list;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F5),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1565C0),
        foregroundColor: Colors.white,
        title: const Text('พาร์ทเนอร์ทั้งหมด', style: TextStyle(fontWeight: FontWeight.bold)),
        elevation: 0,
      ),
      body: Column(
        children: [
          _buildSearchBar(),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _filtered.isEmpty
                    ? _buildEmpty()
                    : GridView.builder(
                        padding: const EdgeInsets.all(16),
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          mainAxisSpacing: 12,
                          crossAxisSpacing: 12,
                          mainAxisExtent: 220,
                        ),
                        itemCount: _filtered.length,
                        itemBuilder: (ctx, i) => _buildPartnerCard(_filtered[i]),
                      ),
          ),
        ],
      ),
    );
  }


  Widget _buildSearchBar() {
    return Container(
      color: const Color(0xFF1565C0),
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: TextField(
        onChanged: (v) => setState(() => _searchQuery = v),
        style: const TextStyle(color: Colors.white),
        decoration: InputDecoration(
          hintText: 'ค้นหาพาร์ทเนอร์...',
          hintStyle: const TextStyle(color: Colors.white60),
          prefixIcon: const Icon(Icons.search, color: Colors.white70),
          filled: true,
          fillColor: Colors.white.withValues(alpha: 0.15),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
          contentPadding: const EdgeInsets.symmetric(vertical: 12),
        ),
      ),
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.store_mall_directory_outlined, size: 64, color: Colors.grey.shade400),
          const SizedBox(height: 12),
          Text('ไม่พบพาร์ทเนอร์', style: TextStyle(fontSize: 16, color: Colors.grey.shade600)),
        ],
      ),
    );
  }

  static Color _tierBorderColor(String? tier) {
    switch (tier) {
      case 'platinum': return const Color(0xFFB0BEC5);
      case 'gold':     return const Color(0xFFF9A825);
      case 'silver':   return const Color(0xFF9E9E9E);
      default:         return Colors.transparent;
    }
  }

  static Color _tierBadgeBg(String? tier) {
    switch (tier) {
      case 'platinum': return const Color(0xFFECEFF1);
      case 'gold':     return const Color(0xFFFFF8E1);
      case 'silver':   return const Color(0xFFF5F5F5);
      default:         return Colors.transparent;
    }
  }

  static Color _tierBadgeText(String? tier) {
    switch (tier) {
      case 'platinum': return const Color(0xFF546E7A);
      case 'gold':     return const Color(0xFFE65100);
      case 'silver':   return const Color(0xFF616161);
      default:         return Colors.transparent;
    }
  }

  static String _tierLabel(String? tier) {
    switch (tier) {
      case 'platinum': return 'แพลตตินัม';
      case 'gold':     return 'ทอง';
      case 'silver':   return 'เงิน';
      default:         return '';
    }
  }

  Widget _buildPartnerCard(Map<String, dynamic> p) {
    final logoUrl = PartnerService.resolveImageUrl(p['logo_url']);
    final coverUrl = PartnerService.resolveImageUrl(p['cover_image_url']);
    final partnerId = p['id'];
    final tier = p['tier']?.toString();
    final hasTier = tier != null && tier != 'none';
    final borderColor = _tierBorderColor(tier);

    return GestureDetector(
      onTap: partnerId != null
          ? () => Navigator.push(context, MaterialPageRoute(builder: (_) => PartnerPage(partnerId: partnerId as int)))
          : null,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: hasTier
              ? Border.all(color: borderColor, width: 2)
              : null,
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              children: [
                ClipRRect(
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
                  child: SizedBox(
                    height: 80,
                    width: double.infinity,
                    child: coverUrl.isNotEmpty
                        ? Image.network(coverUrl, fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => Container(color: const Color(0xFF1565C0)))
                        : Container(color: const Color(0xFF1565C0)),
                  ),
                ),
                if (hasTier)
                  Positioned(
                    top: 6,
                    right: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: _tierBadgeBg(tier),
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: borderColor, width: 1),
                      ),
                      child: Text(
                        _tierLabel(tier),
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.bold,
                          color: _tierBadgeText(tier),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.grey.shade200),
                          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 4)],
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(7),
                          child: logoUrl.isNotEmpty
                              ? Image.network(logoUrl, fit: BoxFit.contain,
                                  errorBuilder: (_, __, ___) => const Icon(Icons.store, size: 20, color: Colors.grey))
                              : const Icon(Icons.store, size: 20, color: Colors.grey),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          p['name']?.toString() ?? '',
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  if ((p['description']?.toString() ?? '').isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      p['description'].toString(),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 11, color: Colors.grey.shade600, height: 1.35),
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
