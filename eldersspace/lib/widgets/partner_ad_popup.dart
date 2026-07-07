import 'package:flutter/material.dart';
import '../services/ad_service.dart';
import '../partner_page.dart';

class PartnerAdPopup {
  static Future<void> show(
    BuildContext context,
    Map<String, dynamic> ad,
  ) async {
    final adId = int.tryParse(ad['id']?.toString() ?? '') ?? 0;
    if (adId > 0) AdService.trackView(adId);

    if (!context.mounted) return;
    await showDialog(
      context: context,
      barrierDismissible: true,
      builder: (_) => _AdDialog(ad: ad, parentContext: context),
    );
  }
}

class _AdDialog extends StatelessWidget {
  final Map<String, dynamic> ad;
  final BuildContext parentContext;

  const _AdDialog({required this.ad, required this.parentContext});

  @override
  Widget build(BuildContext context) {
    final adId       = int.tryParse(ad['id']?.toString() ?? '') ?? 0;
    final title      = AdService.sanitizeText(ad['title']?.toString());
    final body       = AdService.sanitizeText(ad['body']?.toString());
    final ctaText    = ad['cta_text']?.toString() ?? 'ดูเพิ่มเติม';
    final imageUrl   = AdService.resolveImageUrl(ad['image_url']?.toString());
    final logoUrl    = AdService.resolveImageUrl(ad['partner_logo']?.toString());
    final partnerName = ad['partner_name']?.toString() ?? '';
    final partnerId  = ad['partner_id'] != null
        ? int.tryParse(ad['partner_id'].toString())
        : null;

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 48),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header with close + sponsored badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.grey.shade100,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFF6C47D4),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text(
                    'โฆษณา',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const Spacer(),
                GestureDetector(
                  onTap: () {
                    AdService.trackDismiss(adId);
                    Navigator.of(context).pop();
                  },
                  child: Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: Colors.grey.shade300,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.close, size: 16, color: Colors.black54),
                  ),
                ),
              ],
            ),
          ),

          // Ad image
          if (imageUrl.isNotEmpty)
            SizedBox(
              width: double.infinity,
              height: 180,
              child: Image.network(
                imageUrl,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const SizedBox.shrink(),
              ),
            ),

          // Content
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Partner info row
                if (partnerName.isNotEmpty)
                  Row(
                    children: [
                      if (logoUrl.isNotEmpty)
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: Image.network(
                            logoUrl,
                            width: 24,
                            height: 24,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                          ),
                        ),
                      if (logoUrl.isNotEmpty) const SizedBox(width: 6),
                      Text(
                        partnerName,
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade600,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                if (partnerName.isNotEmpty) const SizedBox(height: 8),

                // Title
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),

                // Body
                if (body.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    body,
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.grey.shade700,
                      height: 1.4,
                    ),
                    maxLines: 4,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],

                const SizedBox(height: 14),

                // CTA
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {
                      AdService.trackClick(adId);
                      Navigator.of(context).pop();
                      if (partnerId != null && parentContext.mounted) {
                        Navigator.push(
                          parentContext,
                          MaterialPageRoute(
                            builder: (_) => PartnerPage(partnerId: partnerId),
                          ),
                        );
                      }
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF2E7D32),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                    ),
                    child: Text(
                      ctaText,
                      style: const TextStyle(
                        fontSize: 14,
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
    );
  }
}
