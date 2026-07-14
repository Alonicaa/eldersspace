import 'dart:async';
import 'package:flutter/material.dart';
import 'package:app_links/app_links.dart';
import 'api_service.dart';
import 'app_settings_service.dart';
import '../post_detail_page.dart';

/// จัดการลิงก์แชร์โพสต์ (eldersspace://post/123 หรือ https://.../post/123)
/// - cold start: เก็บ post id ไว้ให้ HomePage ไปเปิดเองหลัง build
/// - warm start (แอพเปิดอยู่แล้ว): เปิด PostDetailPage ทันทีผ่าน navigatorKey
class DeepLinkService {
  DeepLinkService._();

  static final GlobalKey<NavigatorState> navigatorKey =
      GlobalKey<NavigatorState>();

  static int? _pendingPostId;
  static AppLinks? _appLinks;
  static StreamSubscription<Uri>? _sub;

  static int? consumePendingPostId() {
    final id = _pendingPostId;
    _pendingPostId = null;
    return id;
  }

  static void setPendingPostId(int id) => _pendingPostId = id;

  static int? extractPostId(Uri uri) {
    final segments = <String>[
      if (uri.host.isNotEmpty) uri.host,
      ...uri.pathSegments,
    ];
    final idx = segments.indexOf('post');
    if (idx != -1 && idx + 1 < segments.length) {
      return int.tryParse(segments[idx + 1]);
    }
    return null;
  }

  /// เรียกครั้งเดียวตอน app start (mobile เท่านั้น — ใช้ custom scheme fallback)
  static Future<void> init() async {
    _appLinks = AppLinks();

    try {
      final initialUri = await _appLinks!.getInitialLink();
      final id = initialUri != null ? extractPostId(initialUri) : null;
      if (id != null) _pendingPostId = id;
    } catch (_) {}

    _sub = _appLinks!.uriLinkStream.listen((uri) {
      final id = extractPostId(uri);
      if (id != null) _openPost(id);
    });
  }

  static Future<void> _openPost(int postId) async {
    final phone = AppSettingsService.instance.savedPhone;
    if (phone == null) {
      _pendingPostId = postId;
      return;
    }
    final post = await ApiService.getPost(postId, phone: phone);
    if (post == null) return;
    navigatorKey.currentState?.push(
      MaterialPageRoute(
        builder: (_) => PostDetailPage(post: post, currentUserPhone: phone),
      ),
    );
  }

  static void dispose() {
    _sub?.cancel();
  }
}
