import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'services/partner_service.dart';
import 'services/app_settings_service.dart';
import 'partner_opportunities_page.dart';

class PartnerPage extends StatefulWidget {
  final int partnerId;
  const PartnerPage({super.key, required this.partnerId});

  @override
  State<PartnerPage> createState() => _PartnerPageState();
}

class _PartnerPageState extends State<PartnerPage> {
  Map<String, dynamic>? _partner;
  bool _loading = true;

  static String _clean(String? s) => (s ?? '')
      .replaceAll(r'\r\n', '\n')
      .replaceAll(r'\n', '\n')
      .replaceAll(r'\r', '\n');

  @override
  void initState() {
    super.initState();
    _loadPartner();
  }

  Future<void> _loadPartner() async {
    final data = await PartnerService.getPartnerById(widget.partnerId);
    if (mounted) {
      setState(() {
        _partner = data;
        _loading = false;
      });
    }
  }

  String _img(String? raw) => PartnerService.resolveImageUrl(raw);

  List<Map<String, dynamic>> _asList(dynamic v) {
    if (v is List) return v.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    return [];
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (_partner == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('พาร์ทเนอร์')),
        body: const Center(child: Text('ไม่พบข้อมูลพาร์ทเนอร์')),
      );
    }

    final jobs = _asList(_partner!['jobs']);
    final services = _asList(_partner!['services']);
    final banners = _asList(_partner!['banners']);
    final projects = _asList(_partner!['projects']);

    return Scaffold(
      backgroundColor: Colors.white,
      body: CustomScrollView(
        slivers: [
          _buildAppBar(),
          SliverToBoxAdapter(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildPartnerHeader(),
                _buildAboutSection(),
                if (banners.isNotEmpty) _buildBannerSection(banners),
                if (services.isNotEmpty) _buildServicesSection(services),
                if (projects.isNotEmpty)
                  _buildProjectsSection(projects)
                else
                  _buildProjectsSection([]),
                if (jobs.isNotEmpty) _buildJobsSection(jobs),
                _buildFooterNote(),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── App Bar ──

  SliverAppBar _buildAppBar() {
    final coverUrl = _img(_partner!['cover_image_url']);
    return SliverAppBar(
      expandedHeight: 200,
      pinned: true,
      backgroundColor: const Color(0xFF1B5E20),
      leading: IconButton(
        icon: const Icon(Icons.arrow_back, color: Colors.white),
        onPressed: () => Navigator.pop(context),
      ),
      flexibleSpace: FlexibleSpaceBar(
        background: coverUrl.isNotEmpty
            ? Image.network(
                coverUrl,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => _coverFallback(),
              )
            : _coverFallback(),
      ),
    );
  }

  Widget _coverFallback() => Container(
        color: const Color(0xFF1B5E20),
        child: const Center(
          child: Icon(Icons.store, size: 64, color: Colors.white54),
        ),
      );

  // ── Partner Header (logo + name + tag) ──

  Widget _buildPartnerHeader() {
    final logoUrl = _img(_partner!['logo_url']);
    final sinceLabel = _formatSince(_partner!['created_at']?.toString());
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
      child: Row(
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.grey.shade200),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.08),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(11),
              child: logoUrl.isNotEmpty
                  ? Image.network(logoUrl, fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => const Icon(Icons.store, size: 36, color: Colors.grey))
                  : const Icon(Icons.store, size: 36, color: Colors.grey),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _partner!['name'] ?? '',
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1B5E20).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.verified, size: 12, color: Color(0xFF1B5E20)),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text(
                          'พันธมิตร Elders Space',
                          style: const TextStyle(fontSize: 11, color: Color(0xFF1B5E20), fontWeight: FontWeight.w600),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
                if (sinceLabel != null) ...[
                  const SizedBox(height: 5),
                  Row(
                    children: [
                      const Icon(Icons.handshake_outlined, size: 12, color: Color(0xFF9E9E9E)),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text(
                          'เข้าร่วมกับ Elders Space ตั้งแต่ $sinceLabel',
                          style: const TextStyle(fontSize: 11, color: Color(0xFF9E9E9E)),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  String? _formatSince(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    try {
      final utcStr = raw.endsWith('Z') || raw.contains('+') ? raw : '${raw}Z';
      final dt = DateTime.parse(utcStr).add(const Duration(hours: 7));
      const months = [
        '', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
        'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
      ];
      return '${dt.day} ${months[dt.month]} ${dt.year + 543}';
    } catch (_) {
      return null;
    }
  }

  // ── Elder mode helpers ──

  bool get _isElder => AppSettingsService.instance.elderModeNotifier.value;

  Widget _sectionTitle(IconData icon, String text) {
    final isElder = _isElder;
    return Row(
      children: [
        Icon(icon, size: isElder ? 22 : 18, color: const Color(0xFF1B5E20)),
        const SizedBox(width: 6),
        Text(text,
            style: TextStyle(
                fontSize: isElder ? 18 : 16, fontWeight: FontWeight.bold)),
      ],
    );
  }

  Widget _lineIconWidget(double size) {
    return Container(
      width: size + 6,
      height: size + 6,
      decoration: BoxDecoration(
        color: const Color(0xFF06C755),
        borderRadius: BorderRadius.circular((size + 6) * 0.22),
      ),
      alignment: Alignment.center,
      child: Text(
        'LINE',
        style: TextStyle(
          color: Colors.white,
          fontSize: size * 0.42,
          fontWeight: FontWeight.w900,
          height: 1,
          letterSpacing: 0,
        ),
      ),
    );
  }

  Widget _lineContact(String label) {
    final iconSize = _isElder ? 20.0 : 15.0;
    final spacing = _isElder ? 12.0 : 6.0;
    return Padding(
      padding: EdgeInsets.only(bottom: spacing),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _lineIconWidget(iconSize),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                  fontSize: 13, color: Color(0xFF06C755), height: 1.5),
            ),
          ),
        ],
      ),
    );
  }

  // ── About ──

  Widget _buildAboutSection() {
    final p = _partner!;
    final description = _clean(p['description']?.toString());
    final phone    = p['contact_phone']?.toString()    ?? '';
    final email    = p['contact_email']?.toString()    ?? '';
    final line     = p['contact_line']?.toString()     ?? '';
    final facebook = p['contact_facebook']?.toString() ?? '';
    final address  = _clean(p['contact_address']?.toString());

    final hasContact = phone.isNotEmpty || email.isNotEmpty ||
        line.isNotEmpty || facebook.isNotEmpty || address.isNotEmpty;

    if (description.isEmpty && !hasContact) return const SizedBox.shrink();

    final isElder = _isElder;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(height: 1),
        Padding(
          padding: EdgeInsets.all(isElder ? 20 : 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _sectionTitle(Icons.info_outline, 'เกี่ยวกับเรา'),
              if (description.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(description,
                    style: TextStyle(
                        fontSize: isElder ? 15 : 14,
                        height: 1.6,
                        color: const Color(0xFF424242))),
              ],
              if (hasContact) ...[
                const SizedBox(height: 12),
                const Divider(height: 1),
                SizedBox(height: isElder ? 14 : 10),
                if (phone.isNotEmpty)
                  _contactText(Icons.phone_outlined, phone),
                if (email.isNotEmpty)
                  _contactText(Icons.email_outlined, email),
                if (line.isNotEmpty) _lineContact(line),
                if (facebook.isNotEmpty)
                  _contactText(Icons.facebook, facebook,
                      color: const Color(0xFF1877F2)),
                if (address.isNotEmpty)
                  _contactText(Icons.location_on_outlined, address),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _contactText(IconData icon, String label,
      {Color color = const Color(0xFF555555)}) {
    final isElder = _isElder;
    final iconSize = isElder ? 20.0 : 15.0;
    final spacing = isElder ? 12.0 : 6.0;
    return Padding(
      padding: EdgeInsets.only(bottom: spacing),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: iconSize, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                  fontSize: isElder ? 15 : 13, color: color, height: 1.5),
            ),
          ),
        ],
      ),
    );
  }

  // ── Announcement/Banners ──

  Widget _buildBannerSection(List<Map<String, dynamic>> banners) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: _sectionTitle(Icons.campaign_outlined, 'ประชาสัมพันธ์'),
        ),
        ...banners.map((b) => _buildBannerCard(b)).toList(),
      ],
    );
  }

  Widget _buildBannerCard(Map<String, dynamic> b) {
    final imgUrl = _img(b['image_url']);
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 6)],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (imgUrl.isNotEmpty)
              Image.network(
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
            if ((b['title']?.toString() ?? '').isNotEmpty ||
                (b['description']?.toString() ?? '').isNotEmpty)
              Container(
                color: Colors.white,
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if ((b['title']?.toString() ?? '').isNotEmpty)
                      Text(b['title'].toString(),
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                    if ((b['description']?.toString() ?? '').isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(_clean(b['description']?.toString()),
                          style: const TextStyle(fontSize: 13, color: Colors.grey)),
                    ],
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  // ── Services ──

  Widget _buildServicesSection(List<Map<String, dynamic>> services) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: _sectionTitle(Icons.storefront_outlined, 'บริการของเรา'),
        ),
        SizedBox(
          height: _isElder ? 185 : 130,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: services.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (ctx, i) => _buildServiceCard(services[i]),
          ),
        ),
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _buildServiceCard(Map<String, dynamic> s) {
    final imgUrl = _img(s['image_url']);
    return SizedBox(
      width: _isElder ? 158 : 120,
      child: Column(
        children: [
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(_isElder ? 12 : 10),
                color: Colors.grey.shade100,
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(_isElder ? 12 : 10),
                child: imgUrl.isNotEmpty
                    ? Image.network(imgUrl, fit: BoxFit.cover, width: double.infinity,
                        errorBuilder: (_, __, ___) => Icon(Icons.image,
                            size: _isElder ? 44 : 28, color: Colors.grey))
                    : Icon(Icons.image, size: _isElder ? 44 : 32, color: Colors.grey),
              ),
            ),
          ),
          SizedBox(height: _isElder ? 8 : 6),
          Text(
            s['title']?.toString() ?? '',
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
                fontSize: _isElder ? 13 : 12, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }

  // ── Social Projects (dynamic from partner_projects table) ──

  Widget _buildProjectsSection(List<Map<String, dynamic>> projects) {
    // If no DB projects, show a default placeholder card
    final items = projects.isNotEmpty
        ? projects
        : [
            {
              'title': '${_partner!['name'] ?? ''} for Chance',
              'description':
                  'ตั้งเป้าหมายในการสนับสนุนการพัฒนาคุณภาพชีวิตให้กับกลุ่มผู้สูงอายุของประเทศไทย',
              'image_url': null,
              'link_url': null,
            }
          ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: _sectionTitle(Icons.favorite_outline, 'โครงการเพื่อสังคม'),
        ),
        ...items.map((p) => _buildProjectCard(p)).toList(),
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _buildProjectCard(Map<String, dynamic> p) {
    final imgUrl = _img(p['image_url']);
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      decoration: BoxDecoration(
        color: const Color(0xFFE8F5E9),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFA5D6A7)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (imgUrl.isNotEmpty)
            ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
              child: Image.network(
                imgUrl,
                width: double.infinity,
                height: 160,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const SizedBox.shrink(),
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1B5E20).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.volunteer_activism,
                      color: Color(0xFF1B5E20), size: 26),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        p['title']?.toString() ?? '',
                        style: const TextStyle(
                            fontSize: 14, fontWeight: FontWeight.bold),
                      ),
                      if ((p['description']?.toString() ?? '').isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          _clean(p['description']?.toString()),
                          style: const TextStyle(
                              fontSize: 12,
                              height: 1.5,
                              color: Color(0xFF555555)),
                        ),
                      ],
                      const SizedBox(height: 8),
                      GestureDetector(
                        onTap: () async {
                          final link = p['link_url']?.toString() ?? '';
                          if (link.isEmpty) return;
                          final uri = Uri.tryParse(link);
                          if (uri != null && await canLaunchUrl(uri)) {
                            await launchUrl(uri,
                                mode: LaunchMode.externalApplication);
                          }
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 6),
                          decoration: BoxDecoration(
                            color: const Color(0xFF1565C0),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Text(
                            'ดูรายละเอียด',
                            style: TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                                fontWeight: FontWeight.w600),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── Jobs ──

  Widget _buildJobsSection(List<Map<String, dynamic>> jobs) {
    final hasMore = jobs.length > 2;
    final displayed = hasMore ? jobs.take(2).toList() : jobs;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _sectionTitle(Icons.work_outline, 'โอกาสสำหรับคุณ'),
              if (hasMore)
                GestureDetector(
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => PartnerOpportunitiesPage(
                        partnerName: _partner!['name']?.toString() ?? '',
                        partnerLogo: _partner!['logo_url']?.toString(),
                        jobs: jobs,
                      ),
                    ),
                  ),
                  child: const Text(
                    'ดูทั้งหมด',
                    style: TextStyle(fontSize: 13, color: Color(0xFF1565C0)),
                  ),
                ),
            ],
          ),
        ),
        ...displayed.map((j) => _buildJobCard(j)).toList(),
      ],
    );
  }

  Widget _buildJobCard(Map<String, dynamic> j) {
    final logoUrl = _img(_partner!['logo_url']);
    final hasLink = (j['link_url']?.toString() ?? '').isNotEmpty;
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6)
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(8),
                    color: Colors.grey.shade100,
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: logoUrl.isNotEmpty
                        ? Image.network(logoUrl, fit: BoxFit.contain,
                            errorBuilder: (_, __, ___) =>
                                const Icon(Icons.store, color: Colors.grey))
                        : const Icon(Icons.store, color: Colors.grey),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(j['title']?.toString() ?? '',
                          style: const TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 2),
                      Text(_partner!['name']?.toString() ?? '',
                          style: const TextStyle(
                              fontSize: 12,
                              color: Color(0xFF1B5E20),
                              fontWeight: FontWeight.w500)),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          if ((j['job_type']?.toString() ?? '').isNotEmpty) ...[
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.green.shade50,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(j['job_type'].toString(),
                                  style: TextStyle(
                                      fontSize: 10, color: Colors.green.shade700)),
                            ),
                            const SizedBox(width: 6),
                          ],
                          if ((j['location']?.toString() ?? '').isNotEmpty)
                            Flexible(
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.location_on_outlined,
                                      size: 11, color: Colors.grey.shade500),
                                  const SizedBox(width: 2),
                                  Flexible(
                                    child: Text(j['location'].toString(),
                                        style: const TextStyle(
                                            fontSize: 11, color: Colors.grey),
                                        overflow: TextOverflow.ellipsis),
                                  ),
                                ],
                              ),
                            ),
                        ],
                      ),
                      if ((j['salary_range']?.toString() ?? '').isNotEmpty) ...[
                        const SizedBox(height: 3),
                        Row(
                          children: [
                            Icon(Icons.payments_outlined,
                                size: 12, color: Colors.green.shade700),
                            const SizedBox(width: 3),
                            Flexible(
                              child: Text(j['salary_range'].toString(),
                                  style: TextStyle(
                                      fontSize: 11,
                                      color: Colors.green.shade700,
                                      fontWeight: FontWeight.w500),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis),
                            ),
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
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: hasLink
                          ? const Color(0xFF1565C0)
                          : Colors.grey.shade400,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Text('รายละเอียด',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.bold)),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── Footer Note ──

  Widget _buildFooterNote() {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFE8F5E9),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFA5D6A7)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline, size: 16, color: Color(0xFF1B5E20)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'ความไว้วางใจคือหัวใจของเรา\nกรุณาตรวจสอบข้อมูลเพิ่มเติมผ่านแพลตฟอร์มของพาร์ทเนอร์โดยตรง',
              style: const TextStyle(fontSize: 12, height: 1.5, color: Color(0xFF2E7D32)),
            ),
          ),
        ],
      ),
    );
  }
}
