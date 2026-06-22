import 'package:flutter/foundation.dart';
import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'app_config.dart';

/// RewardService — จัดการแต้มทั้งหมด
/// - daily checkin
/// - session tracking (เวลาในแอพ)
/// - heartbeat ทุก 5 นาที
/// - reward settings sync
class RewardService {
  static String get _base => "${AppConfig.apiBaseUrl}/rewards";

  // ── State ──
  static int? _activeSessionId;
  static Timer? _heartbeatTimer;
  static String? _activePhone;
  static Map<String, dynamic>? _cachedSettings;

  // ─────────────────────────────────────────────
  // REWARD SETTINGS (Sync จาก Backend)
  // ─────────────────────────────────────────────
  static Future<Map<String, dynamic>> getRewardSettings() async {
    try {
      final url = Uri.parse('$_base/settings');
      debugPrint('🔄 Fetching reward settings from: $url');
      final res = await http.get(url).timeout(const Duration(seconds: 10));
      debugPrint('📊 Reward settings response status: ${res.statusCode}');
      
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        debugPrint('✅ Reward settings data: $data');
        if (data['success'] == true || data['data'] != null) {
          _cachedSettings = data['data'] ?? data;
          return _cachedSettings ?? {};
        }
      } else {
        debugPrint('❌ Failed to get reward settings: ${res.statusCode} - ${res.body}');
      }
      return _cachedSettings ?? {};
    } catch (e) {
      debugPrint('❌ Error fetching reward settings: $e');
      return _cachedSettings ?? {};
    }
  }

  // ดึงค่า cached settings (ไม่ต้องรอ network)
  static Map<String, dynamic>? getCachedSettings() => _cachedSettings;

  // ดึง session_bonus_threshold จาก settings
  static int getSessionBonusThreshold() {
    return (_cachedSettings?['session_bonus_threshold'] as num?)?.toInt() ?? 40;
  }

  // ─────────────────────────────────────────────
  // DAILY CHECK-IN
  // ─────────────────────────────────────────────
  static Future<Map<String, dynamic>> dailyCheckin(String phoneNumber) async {
    try {
      final res = await http.post(
        Uri.parse('$_base/checkin'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'phone_number': phoneNumber}),
      );
      return jsonDecode(res.body);
    } catch (e) {
      return {'error': 'Connection error: $e'};
    }
  }

  // ─────────────────────────────────────────────
  // REWARD SUMMARY
  // ─────────────────────────────────────────────
  static Future<Map<String, dynamic>> getSummary(String phoneNumber) async {
    try {
      final url = Uri.parse('$_base/summary/$phoneNumber');
      debugPrint('🔄 Fetching reward summary from: $url');
      final res = await http.get(url).timeout(const Duration(seconds: 10));
      debugPrint('📊 Reward summary response status: ${res.statusCode}');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        debugPrint('✅ Reward summary data: $data');
        return data;
      } else {
        debugPrint('❌ Failed to get reward summary: ${res.statusCode}');
      }
      return {'error': 'Failed to get summary'};
    } catch (e) {
      debugPrint('❌ Error fetching reward summary: $e');
      return {'error': 'Connection error: $e'};
    }
  }

  // ─────────────────────────────────────────────
  // SESSION TRACKING
  // เรียก startAppSession() เมื่อ app เข้า foreground
  // เรียก endAppSession() เมื่อ app ออก background
  // ─────────────────────────────────────────────
  /// Returns today's total elapsed minutes (across all sessions) so
  /// the UI can initialise the session timer correctly after a resume.
  static Future<int> startAppSession(String phoneNumber) async {
    if (_activeSessionId != null && _activePhone == phoneNumber) {
      // Already active — return 0 so caller keeps existing state
      return 0;
    }
    try {
      final res = await http.post(
        Uri.parse('$_base/session/start'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'phone_number': phoneNumber}),
      );
      final data = jsonDecode(res.body);
      if (data['session_id'] != null) {
        _activeSessionId = data['session_id'];
        _activePhone = phoneNumber;
        _startHeartbeat(phoneNumber);
      }
      return (data['today_elapsed_minutes'] as num?)?.toInt() ?? 0;
    } catch (_) {
      return 0;
    }
  }

  static Future<Map<String, dynamic>> endAppSession(String phoneNumber) async {
    _stopHeartbeat();
    if (_activeSessionId == null) return {'points_awarded': 0};
    try {
      final res = await http.post(
        Uri.parse('$_base/session/end'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'phone_number': phoneNumber,
          'session_id': _activeSessionId,
        }),
      );
      _activeSessionId = null;
      _activePhone = null;
      return jsonDecode(res.body);
    } catch (e) {
      return {'error': 'Connection error: $e'};
    }
  }

  // ─────────────────────────────────────────────
  // HEARTBEAT — ส่งทุก 5 นาที
  // เพื่อให้ server update แต้มแบบ realtime
  // ─────────────────────────────────────────────
  static void _startHeartbeat(String phoneNumber) {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(
      const Duration(minutes: 5),
      (_) => _sendHeartbeat(phoneNumber),
    );
  }

  static void _stopHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
  }

  static Future<Map<String, dynamic>?> _sendHeartbeat(
    String phoneNumber,
  ) async {
    if (_activeSessionId == null) return null;
    try {
      final res = await http.post(
        Uri.parse('$_base/session/heartbeat'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'phone_number': phoneNumber,
          'session_id': _activeSessionId,
        }),
      );
      return jsonDecode(res.body);
    } catch (_) {
      return null;
    }
  }

  // สำหรับ UI poll ข้อมูล session แบบ manual
  static Future<Map<String, dynamic>?> heartbeat(String phoneNumber) async {
    return _sendHeartbeat(phoneNumber);
  }

  static bool get hasActiveSession => _activeSessionId != null;
  static int? get activeSessionId => _activeSessionId;

  // ─────────────────────────────────────────────
  // EARN HISTORY
  // ดึงรายการรับแต้ม (checkin, app_time, streak)
  // ─────────────────────────────────────────────
  static Future<List<dynamic>> getEarnHistory(String phoneNumber) async {
    // Try multiple possible endpoint patterns
    final candidates = [
      '$_base/history/$phoneNumber',
      '$_base/transactions/$phoneNumber',
      '$_base/earn-history/$phoneNumber',
      '${AppConfig.apiBaseUrl}/rewards/history/$phoneNumber',
      '${AppConfig.apiBaseUrl}/points/history/$phoneNumber',
    ];
    for (final endpoint in candidates) {
      try {
        final url = Uri.parse(endpoint);
        debugPrint('🔄 Trying earn history from: $url');
        final res = await http.get(url).timeout(const Duration(seconds: 6));
        if (res.statusCode == 200) {
          final data = jsonDecode(res.body);
          final list = (data['data'] as List?) ??
              (data['transactions'] as List?) ??
              (data['history'] as List?) ??
              (data['recent_transactions'] as List?);
          if (list != null) {
            debugPrint('✅ Earn history from $endpoint: ${list.length} items');
            return list;
          }
        }
      } catch (_) {}
    }
    debugPrint('⚠️ No earn history endpoint found — returning empty');
    return [];
  }

  // ─────────────────────────────────────────────
  // REDEMPTION HISTORY
  // ดึงรายการแลกรางวัลทั้งหมดพร้อมข้อมูล QR code
  // ─────────────────────────────────────────────
  static Future<List<dynamic>> getRedemptionHistory(String phoneNumber) async {
    // Try multiple endpoint patterns and response shapes to be resilient
    final candidates = [
      '${AppConfig.apiBaseUrl}/redemptions?search=$phoneNumber&limit=100',
      '${AppConfig.apiBaseUrl}/rewards/redemptions?search=$phoneNumber&limit=100',
      '${AppConfig.serverBaseUrl}/redemptions?search=$phoneNumber&limit=100',
      '${AppConfig.serverBaseUrl}/api/redemptions?search=$phoneNumber&limit=100',
      '${AppConfig.serverBaseUrl}/api/rewards/redemptions?search=$phoneNumber&limit=100',
      '${AppConfig.apiBaseUrl}/redemptions/$phoneNumber',
      '${AppConfig.apiBaseUrl}/rewards/redemptions/$phoneNumber',
    ];

    for (final ep in candidates) {
      try {
        final url = Uri.parse(ep);
        debugPrint('🔄 Trying redemption history endpoint: $url');
        final res = await http.get(url).timeout(const Duration(seconds: 8));
        debugPrint('📊 Response ${res.statusCode} from $url');
        if (res.statusCode != 200) continue;
        final data = jsonDecode(res.body);

        // Try several possible shapes that backends may return
        List<dynamic>? list;
        if (data is List) {
          list = data;
        } else if (data is Map) {
          list = (data['data'] as List?) ??
              (data['rows'] as List?) ??
              (data['redemptions'] as List?) ??
              (data['items'] as List?);
        }

        if (list != null) {
          debugPrint('✅ Redemption history from $url: ${list.length} items');
          return list;
        }
      } catch (e) {
        debugPrint('⚠️ Endpoint $ep failed: $e');
        continue;
      }
    }

    debugPrint('⚠️ No redemption history endpoint returned data — returning empty list');
    return [];
  }

  static Future<Map<String, dynamic>> getRedemptionRecord(String phoneNumber, String qrCode) async {
    try {
      final baseUrl = AppConfig.apiBaseUrl;
      final url = Uri.parse('$baseUrl/rewards/redemption-history/$phoneNumber/$qrCode');
      debugPrint('🔄 Fetching redemption record from: $url');
      final res = await http.get(url).timeout(const Duration(seconds: 10));
      debugPrint('📊 Redemption record response status: ${res.statusCode}');
      
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        debugPrint('✅ Redemption record fetched: $data');
        // Extract data from nested response structure
        if (data is Map && data.containsKey('data')) {
          final recordData = data['data'];
          if (recordData is Map) {
            return Map<String, dynamic>.from(recordData);
          }
        } else if (data is Map) {
          return Map<String, dynamic>.from(data);
        }
        return {};
      } else {
        debugPrint('❌ Failed to get redemption record: ${res.statusCode} - ${res.body}');
        return {};
      }
    } catch (e) {
      debugPrint('❌ Error fetching redemption record: $e');
      return {};
    }
  }

  // ─────────────────────────────────────────────
  // AVAILABLE REWARDS
  // ─────────────────────────────────────────────
  static Future<Map<String, dynamic>> getAvailableRewards(
    String phoneNumber,
  ) async {
    try {
      final res = await http.get(Uri.parse('$_base/available/$phoneNumber'));
      return jsonDecode(res.body);
    } catch (e) {
      return {'error': 'Connection error: $e', 'rewards': []};
    }
  }

  // ─────────────────────────────────────────────
  // REDEEM REWARD
  // ─────────────────────────────────────────────
  static Future<Map<String, dynamic>> redeemReward(
    String phoneNumber,
    int rewardId,
  ) async {
    try {
      final res = await http.post(
        Uri.parse('$_base/redeem'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'phone_number': phoneNumber, 'reward_id': rewardId}),
      );
      return jsonDecode(res.body);
    } catch (e) {
      return {'error': 'Connection error: $e', 'success': false};
    }
  }

  // ดึงข้อมูล redemption record ล่าสุด
  static Future<Map<String, dynamic>> getLatestRedemption(
    String phoneNumber,
    String qrCode,
  ) async {
    try {
      final url = Uri.parse('$_base/redemption-history/$phoneNumber/$qrCode');
      debugPrint('🔄 Fetching latest redemption from: $url');
      final res = await http.get(url).timeout(const Duration(seconds: 10));
      debugPrint('📊 Latest redemption response status: ${res.statusCode}');
      
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        // Extract data from nested response
        if (data is Map && data.containsKey('data')) {
          final recordData = data['data'];
          if (recordData is Map) {
            debugPrint('✅ Latest redemption found: $recordData');
            return Map<String, dynamic>.from(recordData);
          }
        } else if (data is Map) {
          debugPrint('✅ Latest redemption found: $data');
          return Map<String, dynamic>.from(data);
        }
      }
      debugPrint('❌ Failed to get latest redemption: ${res.statusCode}');
      return {};
    } catch (e) {
      debugPrint('❌ Error fetching latest redemption: $e');
      return {};
    }
  }

  // ─────────────────────────────────────────────
  // ACTIVITY-BASED REWARDS
  // ─────────────────────────────────────────────

  /// ตรวจสอบ Profile Completion (+50 points)
  /// one-time reward when profile is complete
  static Future<Map<String, dynamic>> checkProfileCompletion(
    String phoneNumber,
  ) async {
    try {
      final res = await http.post(
        Uri.parse('$_base/check-profile-completion/$phoneNumber'),
        headers: {'Content-Type': 'application/json'},
      );
      return jsonDecode(res.body);
    } catch (e) {
      return {
        'success': false,
        'error': 'Connection error: $e',
        'points_awarded': 0
      };
    }
  }

  /// ตรวจสอบ Post Activity (+10 points per day)
  /// reward when user makes 2+ posts in a day
  static Future<Map<String, dynamic>> checkPostActivity(
    String phoneNumber,
  ) async {
    try {
      final res = await http.post(
        Uri.parse('$_base/check-post-activity/$phoneNumber'),
        headers: {'Content-Type': 'application/json'},
      );
      return jsonDecode(res.body);
    } catch (e) {
      return {
        'success': false,
        'error': 'Connection error: $e',
        'points_awarded': 0
      };
    }
  }

  /// ตรวจสอบ Comment Activity (+2 points per comment, max 5/day)
  /// reward when user comments, max 5 comments per day = 10 points
  static Future<Map<String, dynamic>> checkCommentActivity(
    String phoneNumber,
  ) async {
    try {
      final res = await http.post(
        Uri.parse('$_base/check-comment-activity/$phoneNumber'),
        headers: {'Content-Type': 'application/json'},
      );
      return jsonDecode(res.body);
    } catch (e) {
      return {
        'success': false,
        'error': 'Connection error: $e',
        'points_awarded': 0
      };
    }
  }

  /// ดึงรายการโค้ดทั้งหมดสำหรับรางวัลแต่ละตัว
  static Future<List<dynamic>> getPromoCodesByReward(dynamic rewardId) async {
    try {
      final url = Uri.parse('${AppConfig.apiBaseUrl}/promo-codes?reward_id=$rewardId&limit=100');
      debugPrint('🎯 Fetching promo codes for reward $rewardId: $url');
      
      final res = await http.get(url).timeout(const Duration(seconds: 10));
      debugPrint('📋 Promo codes response status: ${res.statusCode}');
      
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['success'] == true && data['data'] is List) {
          final codes = data['data'] as List;
          debugPrint('✅ Got ${codes.length} promo codes for reward $rewardId');
          return codes;
        }
      }
      debugPrint('❌ Failed to get promo codes: ${res.statusCode} - ${res.body}');
      return [];
    } catch (e) {
      debugPrint('❌ Error fetching promo codes: $e');
      return [];
    }
  }

  // ─────────────────────────────────────────────
  // CODE REPORTS
  // ─────────────────────────────────────────────

  /// แจ้งปัญหาโค้ดส่วนลด
  /// [issueType]: 'not_working' | 'wrong_reward' | 'already_expired' | 'other'
  static Future<Map<String, dynamic>> reportCode({
    required String phoneNumber,
    required int redemptionId,
    required String issueType,
    String? description,
  }) async {
    try {
      final res = await http.post(
        Uri.parse('$_base/report-code'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'phone_number': phoneNumber,
          'redemption_id': redemptionId,
          'issue_type': issueType,
          'description': description,
        }),
      ).timeout(const Duration(seconds: 10));
      return jsonDecode(res.body);
    } catch (e) {
      return {'error': 'Connection error: $e'};
    }
  }

  /// ดูรายงานปัญหาโค้ดของฉัน
  static Future<List<dynamic>> getMyReports(String phoneNumber) async {
    try {
      final url = Uri.parse('$_base/my-reports?phone_number=${Uri.encodeComponent(phoneNumber)}');
      final res = await http.get(url).timeout(const Duration(seconds: 10));
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        return (data['data'] as List?) ?? [];
      }
      return [];
    } catch (e) {
      return [];
    }
  }
}
