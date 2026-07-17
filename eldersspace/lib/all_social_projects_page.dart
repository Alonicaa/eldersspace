import 'package:flutter/material.dart';
import 'services/partner_service.dart';
import 'partner_page.dart';

class AllSocialProjectsPage extends StatelessWidget {
  final List<Map<String, dynamic>> projects;
  const AllSocialProjectsPage({super.key, required this.projects});

  static String _clean(String s) => s
      .replaceAll(r'\r\n', '\n')
      .replaceAll(r'\n', '\n')
      .replaceAll(r'\r', '\n')
      .trim();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F5),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1565C0),
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text(
          'โครงการเพื่อสังคม',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      body: projects.isEmpty
          ? const Center(child: Text('ไม่มีโครงการในขณะนี้'))
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: projects.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (ctx, i) => _buildProjectCard(context, projects[i]),
            ),
    );
  }

  Widget _buildProjectCard(BuildContext context, Map<String, dynamic> p) {
    final imgUrl = PartnerService.resolveImageUrl(p['image_url']);
    final logoUrl = PartnerService.resolveImageUrl(p['partner_logo']);
    final partnerId = p['partner_id'];
    final title = p['title']?.toString() ?? '';
    final desc = _clean(p['description']?.toString() ?? '');
    final partnerName = p['partner_name']?.toString() ?? '';

    return GestureDetector(
      onTap: partnerId != null
          ? () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => PartnerPage(partnerId: partnerId as int),
                ),
              )
          : null,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
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
            // Image area
            if (imgUrl.isNotEmpty)
              ClipRRect(
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(14)),
                child: Image.network(
                  imgUrl,
                  width: double.infinity,
                  height: 160,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => _placeholderBanner(),
                ),
              )
            else
              ClipRRect(
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(14)),
                child: _placeholderBanner(),
              ),
            // Info area
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Partner badge
                  if (partnerName.isNotEmpty)
                    Row(
                      children: [
                        if (logoUrl.isNotEmpty)
                          Container(
                            width: 20,
                            height: 20,
                            margin: const EdgeInsets.only(right: 6),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(4),
                              color: Colors.grey.shade100,
                            ),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(4),
                              child: Image.network(
                                logoUrl,
                                fit: BoxFit.contain,
                                errorBuilder: (_, __, ___) => const Icon(
                                    Icons.store,
                                    size: 12,
                                    color: Colors.grey),
                              ),
                            ),
                          ),
                        Flexible(
                          child: Text(
                            partnerName,
                            style: const TextStyle(
                              fontSize: 12,
                              color: Color(0xFF1B5E20),
                              fontWeight: FontWeight.w600,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  if (partnerName.isNotEmpty) const SizedBox(height: 6),
                  // Title
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: Colors.black87,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  // Description
                  if (desc.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      desc,
                      style: const TextStyle(
                          fontSize: 13, color: Colors.grey, height: 1.5),
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                  const SizedBox(height: 12),
                  // Button
                  Align(
                    alignment: Alignment.centerRight,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 7),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1565C0),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: const Text(
                        'ดูรายละเอียด',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _placeholderBanner() {
    return Container(
      width: double.infinity,
      height: 160,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF1B5E20), Color(0xFF388E3C)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: const Center(
        child: Icon(Icons.volunteer_activism, size: 48, color: Colors.white54),
      ),
    );
  }
}
