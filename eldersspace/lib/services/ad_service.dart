import 'dart:convert';
import 'package:http/http.dart' as http;
import 'app_config.dart';

class AdService {
  static String get _base => AppConfig.apiBaseUrl;

  static Future<List<Map<String, dynamic>>> getAds({required String format}) async {
    try {
      final res = await http
          .get(Uri.parse('$_base/ads?format=$format'))
          .timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) return [];
      final data = jsonDecode(res.body);
      if (data is! List) return [];
      return data.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<List<Map<String, dynamic>>> getPopupAds() =>
      getAds(format: 'popup');

  static Future<List<Map<String, dynamic>>> getNotificationAds() =>
      getAds(format: 'notification');

  static Future<List<Map<String, dynamic>>> getArticleAds() =>
      getAds(format: 'article');

  static Future<void> trackView(int adId) async {
    try {
      await http
          .post(Uri.parse('$_base/ads/$adId/view'))
          .timeout(const Duration(seconds: 5));
    } catch (_) {}
  }

  static Future<void> trackClick(int adId) async {
    try {
      await http
          .post(Uri.parse('$_base/ads/$adId/click'))
          .timeout(const Duration(seconds: 5));
    } catch (_) {}
  }

  static Future<void> trackDismiss(int adId) async {
    try {
      await http
          .post(Uri.parse('$_base/ads/$adId/dismiss'))
          .timeout(const Duration(seconds: 5));
    } catch (_) {}
  }

  static Future<void> registerFcmToken({
    required String phone,
    required String token,
  }) async {
    try {
      await http
          .post(
            Uri.parse('$_base/ads/fcm-token'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'phone': phone, 'fcm_token': token}),
          )
          .timeout(const Duration(seconds: 10));
    } catch (_) {}
  }

  static String resolveImageUrl(String? rawUrl) {
    if (rawUrl == null || rawUrl.isEmpty) return '';
    if (rawUrl.startsWith('http')) return rawUrl;
    final base = AppConfig.apiBaseUrl.replaceFirst('/api', '');
    return '$base$rawUrl';
  }

  /// Some partner content is stored with literal escape sequences
  /// (e.g. "\r\n" as four characters instead of an actual newline).
  /// Convert those back to real line breaks before displaying.
  static String sanitizeText(String? raw) {
    if (raw == null || raw.isEmpty) return '';
    return raw
        .replaceAll(r'\r\n', '\n')
        .replaceAll(r'\n', '\n')
        .replaceAll(r'\r', '\n')
        .trim();
  }
}
