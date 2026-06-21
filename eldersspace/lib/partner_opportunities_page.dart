import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'services/partner_service.dart';

class PartnerOpportunitiesPage extends StatelessWidget {
  final String partnerName;
  final String? partnerLogo;
  final List<Map<String, dynamic>> jobs;

  const PartnerOpportunitiesPage({
    super.key,
    required this.partnerName,
    this.partnerLogo,
    required this.jobs,
  });

  @override
  Widget build(BuildContext context) {
    final logoUrl = PartnerService.resolveImageUrl(partnerLogo);
    const green = Color(0xFF1565C0);

    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F5),
      appBar: AppBar(
        backgroundColor: green,
        foregroundColor: Colors.white,
        title: Row(
          children: [
            if (logoUrl.isNotEmpty) ...[
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: Image.network(logoUrl, fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => const Icon(Icons.store, size: 16, color: Colors.grey)),
                ),
              ),
              const SizedBox(width: 8),
            ],
            Expanded(
              child: Text(
                'โอกาสจาก $partnerName',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        elevation: 0,
      ),
      body: jobs.isEmpty
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.work_off_outlined, size: 64, color: Colors.grey.shade400),
                  const SizedBox(height: 12),
                  Text('ไม่มีตำแหน่งงานในขณะนี้', style: TextStyle(fontSize: 16, color: Colors.grey.shade600)),
                ],
              ),
            )
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: jobs.length,
              itemBuilder: (ctx, i) => _buildJobCard(context, jobs[i], logoUrl),
            ),
    );
  }

  Widget _buildJobCard(BuildContext context, Map<String, dynamic> j, String logoUrl) {
    final hasLink = (j['link_url']?.toString() ?? '').isNotEmpty;
    const green = Color(0xFF1565C0);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6)],
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
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), color: Colors.grey.shade100),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: logoUrl.isNotEmpty
                        ? Image.network(logoUrl, fit: BoxFit.contain,
                            errorBuilder: (_, __, ___) => const Icon(Icons.store, color: Colors.grey))
                        : const Icon(Icons.store, color: Colors.grey),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(j['title']?.toString() ?? '', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 2),
                      Text(partnerName, style: const TextStyle(fontSize: 12, color: green, fontWeight: FontWeight.w500)),
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
                            Text(j['salary_range'].toString(), style: TextStyle(fontSize: 11, color: Colors.green.shade700, fontWeight: FontWeight.w500)),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
                GestureDetector(
                  onTap: () async {
                    final link = j['link_url']?.toString() ?? '';
                    if (link.isEmpty) return;
                    final uri = Uri.tryParse(link);
                    if (uri != null && await canLaunchUrl(uri)) {
                      await launchUrl(uri, mode: LaunchMode.externalApplication);
                    }
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: hasLink ? green : Colors.grey.shade400,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Text('รายละเอียด', style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
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
