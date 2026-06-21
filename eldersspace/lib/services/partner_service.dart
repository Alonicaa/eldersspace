import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'app_config.dart';

class PartnerService {
  static String get _base => AppConfig.apiBaseUrl;

  // ── Partners ──

  static Future<List<Map<String, dynamic>>> getPartners() async {
    try {
      final res = await http
          .get(Uri.parse('$_base/partners'))
          .timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) return [];
      final data = jsonDecode(res.body);
      if (data is! List) return [];
      return data.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    } catch (_) {
      return [];
    }
  }

  static Future<Map<String, dynamic>?> getPartnerById(int id) async {
    try {
      final res = await http
          .get(Uri.parse('$_base/partners/$id'))
          .timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) return null;
      final data = jsonDecode(res.body);
      return data is Map<String, dynamic> ? data : null;
    } catch (_) {
      return null;
    }
  }

  // ── Jobs ──

  static Future<List<Map<String, dynamic>>> getPartnerJobs() async {
    try {
      final res = await http
          .get(Uri.parse('$_base/partners/jobs'))
          .timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) return [];
      final data = jsonDecode(res.body);
      if (data is! List) return [];
      return data.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    } catch (_) {
      return [];
    }
  }

  // ── Social Projects (all partners) ──

  static Future<List<Map<String, dynamic>>> getAllSocialProjects() async {
    try {
      final res = await http
          .get(Uri.parse('$_base/partners/projects/all'))
          .timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) return [];
      final data = jsonDecode(res.body);
      if (data is! List) return [];
      return data.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    } catch (_) {
      return [];
    }
  }

  // ── Home Banners ──

  /// [type] can be: 'benefits', 'announcement', 'special_offer', 'sponsor', 'general', or null for all
  static Future<List<Map<String, dynamic>>> getHomeBanners({String? type}) async {
    try {
      var uri = Uri.parse('$_base/banners');
      if (type != null) {
        uri = uri.replace(queryParameters: {'type': type});
      }
      final res = await http.get(uri).timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) return [];
      final data = jsonDecode(res.body);
      if (data is! List) return [];
      return data.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    } catch (_) {
      return [];
    }
  }

  // ── Banner Tracking ──

  /// Call when a banner becomes visible on screen
  static Future<void> trackBannerView(int bannerId) async {
    try {
      await http
          .post(Uri.parse('$_base/banners/$bannerId/view'))
          .timeout(const Duration(seconds: 5));
    } catch (_) {}
  }

  /// Call when user taps a banner
  static Future<void> trackBannerClick(int bannerId) async {
    try {
      await http
          .post(Uri.parse('$_base/banners/$bannerId/click'))
          .timeout(const Duration(seconds: 5));
    } catch (_) {}
  }

  /// Resolve a stored path (e.g. /uploads/banners/foo.jpg) to a full URL
  static String resolveImageUrl(String? rawUrl) {
    if (rawUrl == null || rawUrl.isEmpty) return '';
    if (rawUrl.startsWith('http')) return rawUrl;
    final base = AppConfig.apiBaseUrl.replaceFirst('/api', '');
    return '$base$rawUrl';
  }
}
