import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'services/partner_service.dart';
import 'partner_page.dart';

class AllOpportunitiesPage extends StatefulWidget {
  const AllOpportunitiesPage({super.key});

  @override
  State<AllOpportunitiesPage> createState() => _AllOpportunitiesPageState();
}

class _AllOpportunitiesPageState extends State<AllOpportunitiesPage> {
  List<Map<String, dynamic>> _jobs = [];
  bool _loading = true;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final jobs = await PartnerService.getPartnerJobs();
    if (mounted) setState(() { _jobs = jobs; _loading = false; });
  }

  List<Map<String, dynamic>> get _filtered {
    if (_searchQuery.isEmpty) return _jobs;
    final q = _searchQuery.toLowerCase();
    return _jobs.where((j) =>
      (j['title']?.toString().toLowerCase().contains(q) ?? false) ||
      (j['partner_name']?.toString().toLowerCase().contains(q) ?? false) ||
      (j['location']?.toString().toLowerCase().contains(q) ?? false)
    ).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F5),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1565C0),
        foregroundColor: Colors.white,
        title: const Text('โอกาสในการทำงาน', style: TextStyle(fontWeight: FontWeight.bold)),
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
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _filtered.length,
                        itemBuilder: (ctx, i) => _buildJobCard(_filtered[i]),
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
          hintText: 'ค้นหาตำแหน่งงาน...',
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
          Icon(Icons.work_off_outlined, size: 64, color: Colors.grey.shade400),
          const SizedBox(height: 12),
          Text('ไม่พบตำแหน่งงาน', style: TextStyle(fontSize: 16, color: Colors.grey.shade600)),
        ],
      ),
    );
  }

  Widget _buildJobCard(Map<String, dynamic> j) {
    final logoUrl = PartnerService.resolveImageUrl(j['partner_logo']);
    final partnerId = j['partner_id'];
    final hasLink = (j['link_url']?.toString() ?? '').isNotEmpty;
    const green = Color(0xFF1565C0);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: const BoxDecoration(
              color: Color(0xFFE65100),
              borderRadius: BorderRadius.only(topLeft: Radius.circular(14), bottomRight: Radius.circular(10)),
            ),
            child: const Text('แนะนำ', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                GestureDetector(
                  onTap: partnerId != null ? () => Navigator.push(context, MaterialPageRoute(builder: (_) => PartnerPage(partnerId: partnerId as int))) : null,
                  child: Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(borderRadius: BorderRadius.circular(10), color: Colors.grey.shade100),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: logoUrl.isNotEmpty
                          ? Image.network(logoUrl, fit: BoxFit.contain, errorBuilder: (_, __, ___) => const Icon(Icons.store, color: Colors.grey))
                          : const Icon(Icons.store, color: Colors.grey),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(j['title']?.toString() ?? '', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 2),
                      Text(j['partner_name']?.toString() ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: green, fontWeight: FontWeight.w500)),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          if ((j['job_type']?.toString() ?? '').isNotEmpty) ...[
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(color: Colors.green.shade50, borderRadius: BorderRadius.circular(4)),
                              child: Text(j['job_type'].toString(), style: TextStyle(fontSize: 10, color: Colors.green.shade700)),
                            ),
                            const SizedBox(width: 6),
                          ],
                          if ((j['location']?.toString() ?? '').isNotEmpty)
                            Flexible(
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.location_on_outlined, size: 11, color: Colors.grey.shade500),
                                  const SizedBox(width: 2),
                                  Flexible(child: Text(j['location'].toString(), style: const TextStyle(fontSize: 11, color: Colors.grey), overflow: TextOverflow.ellipsis)),
                                ],
                              ),
                            ),
                        ],
                      ),
                      if ((j['salary_range']?.toString() ?? '').isNotEmpty) ...[
                        const SizedBox(height: 3),
                        Row(
                          children: [
                            Icon(Icons.payments_outlined, size: 12, color: Colors.green.shade700),
                            const SizedBox(width: 3),
                            Flexible(child: Text(j['salary_range'].toString(), style: TextStyle(fontSize: 11, color: Colors.green.shade700, fontWeight: FontWeight.w500), maxLines: 1, overflow: TextOverflow.ellipsis)),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
                GestureDetector(
                  onTap: () async {
                    final link = j['link_url']?.toString() ?? '';
                    if (link.isNotEmpty) {
                      final uri = Uri.tryParse(link);
                      if (uri != null && await canLaunchUrl(uri)) {
                        await launchUrl(uri, mode: LaunchMode.externalApplication);
                        return;
                      }
                    }
                    if (partnerId != null && context.mounted) {
                      Navigator.push(context, MaterialPageRoute(builder: (_) => PartnerPage(partnerId: partnerId as int)));
                    }
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: hasLink ? green : Colors.grey.shade400,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Text('สมัคร', style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
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
