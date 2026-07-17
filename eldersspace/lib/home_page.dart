import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'services/api_service.dart';
import 'services/reward_service.dart';
import 'services/partner_service.dart';
import 'services/ad_service.dart';
import 'community_page.dart';
import 'notification_page.dart';
import 'profile_page.dart';
import 'partner_page.dart';
import 'all_opportunities_page.dart';
import 'all_announcements_page.dart';
import 'all_partners_page.dart';
import 'all_social_projects_page.dart';
import 'reward_history_page.dart';
import 'widgets/reward_stats_row.dart';
import 'widgets/session_banner.dart';
import 'widgets/daily_checkin_card.dart';
import 'widgets/activity_rewards_checker.dart';
import 'widgets/partner_ad_popup.dart';
import 'services/app_settings_service.dart';
import 'services/app_config.dart';
import 'services/deep_link_service.dart';
import 'app_settings_page.dart';
import 'health_page.dart';
import 'article_detail_page.dart';
import 'post_detail_page.dart';

class HomePage extends StatefulWidget {
  final String phoneNumber;
  const HomePage({super.key, required this.phoneNumber});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> with WidgetsBindingObserver {
  static String _clean(String s) => s
      .replaceAll(r'\r\n', '\n')
      .replaceAll(r'\n', '\n')
      .replaceAll(r'\r', '\n')
      .trim();

  Map<String, dynamic>? userData;
  bool isLoadingUser = true;
  String? _profilePictureUrl;

  // Moderation
  bool _isBlocked = false;
  String _blockedReason = '';
  String _warningNote = '';

  // Reward
  Map<String, dynamic>? rewardSummary;
  bool isCheckingIn = false;
  bool _showSessionBanner = true;
  Timer? _sessionTimer;
  Timer? _midnightRefreshTimer;
  int _sessionElapsed = 0;
  int _minutesToNextPoint = 40;
  int _rewardThreshold = 40;
  int _pointsPerReward = 8;
  int _usageDailyLimitCount = 2;
  int _usageDailyMaxPoints = 16;

  // Dynamic partner/banner data
  List<Map<String, dynamic>> _benefitBanners = [];
  List<Map<String, dynamic>> _announcementBanners = [];
  List<Map<String, dynamic>> _specialOfferBanners = [];
  List<Map<String, dynamic>> _sponsorBanners = [];
  List<Map<String, dynamic>> _partners = [];
  List<Map<String, dynamic>> _partnerJobs = [];
  List<Map<String, dynamic>> _generalBanners = [];
  List<Map<String, dynamic>> _availableRewards = [];
  List<Map<String, dynamic>> _socialProjects = [];
  List<Map<String, dynamic>> _popularHealthArticles = [];
  List<Map<String, dynamic>> _popularNutritionArticles = [];
  List<Map<String, dynamic>> _popularGeneralArticles = [];
  List<Map<String, dynamic>> _popularMindArticles = [];
  bool _loadingBanners = true;

  final List<Timer> _popupTimers = [];

  // Announcement carousel
  late final PageController _annPageCtrl;
  Timer? _annTimer;
  int _annPage = 0;

  // Social projects carousel
  late final PageController _socialPageCtrl;
  int _socialPage = 0;

  int _currentTab = 0;

  // ── Helpers ──

  int _asInt(dynamic v, {int fallback = 0}) {
    if (v == null) return fallback;
    if (v is int) return v;
    if (v is num) return v.toInt();
    return int.tryParse(v.toString()) ?? fallback;
  }

  double _asDouble(dynamic v, {double fallback = 0.0}) {
    if (v == null) return fallback;
    if (v is double) return v;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString()) ?? fallback;
  }

  bool _asBool(dynamic v, {bool fallback = false}) {
    if (v == null) return fallback;
    if (v is bool) return v;
    if (v is num) return v != 0;
    final t = v.toString().toLowerCase();
    return t == 'true' || t == '1'
        ? true
        : (t == 'false' || t == '0' ? false : fallback);
  }

  // ── Lifecycle ──

  @override
  void initState() {
    super.initState();
    _annPageCtrl = PageController(viewportFraction: 0.88);
    _socialPageCtrl = PageController(viewportFraction: 0.88);
    WidgetsBinding.instance.addObserver(this);
    AppSettingsService.instance.setActiveUser(widget.phoneNumber);
    _loadRewardSettings();
    loadUser();
    _checkBlockedStatus();
    loadRewardSummary();
    _loadPartnerData();
    _scheduleMidnightRefresh();
    _startSession();
    _registerFcmToken();
    _schedulePopupAds();
    _openPendingSharedPost();
  }

  // เปิดโพสต์ที่มาจากลิงก์แชร์ (deep link) ถ้ามีค้างอยู่
  Future<void> _openPendingSharedPost() async {
    final postId = DeepLinkService.consumePendingPostId();
    if (postId == null) return;
    final post = await ApiService.getPost(postId, phone: widget.phoneNumber);
    if (!mounted) return;
    if (post == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('ไม่พบโพสต์นี้ หรือไม่มีสิทธิ์เข้าถึง')),
      );
      return;
    }
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) =>
            PostDetailPage(post: post, currentUserPhone: widget.phoneNumber),
      ),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _annTimer?.cancel();
    _annPageCtrl.dispose();
    _socialPageCtrl.dispose();
    _sessionTimer?.cancel();
    _midnightRefreshTimer?.cancel();
    for (final t in _popupTimers) {
      t.cancel();
    }
    RewardService.endAppSession(widget.phoneNumber);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _startSession();
    } else if (state == AppLifecycleState.paused) {
      RewardService.endAppSession(widget.phoneNumber).then((result) {
        if ((result['points_awarded'] ?? 0) > 0 && mounted) {
          _showPointsSnackbar(
            '⏱️ ได้รับ +${result['points_awarded']} แต้มจากการใช้งาน!',
          );
          loadRewardSummary();
        }
      });
    }
  }

  void _scheduleMidnightRefresh() {
    _midnightRefreshTimer?.cancel();
    final now = DateTime.now();
    final nextMidnight = DateTime(now.year, now.month, now.day + 1);
    _midnightRefreshTimer = Timer(nextMidnight.difference(now), () async {
      await loadRewardSummary();
      if (mounted) _scheduleMidnightRefresh();
    });
  }

  void _startSession() async {
    final todayElapsed = await RewardService.startAppSession(
      widget.phoneNumber,
    );
    if (mounted && todayElapsed > 0)
      setState(() => _sessionElapsed = todayElapsed);
    _startSessionTimer();
  }

  Future<void> _loadPartnerData() async {
    final results = await Future.wait([
      PartnerService.getHomeBanners(type: 'benefits'),
      PartnerService.getHomeBanners(type: 'announcement'),
      PartnerService.getHomeBanners(type: 'special_offer'),
      PartnerService.getHomeBanners(type: 'sponsor'),
      PartnerService.getPartnerJobs(),
      PartnerService.getHomeBanners(type: 'general'),
      ApiService.getArticles(sort: 'popular', limit: 6, category: 'สุขภาพ'),
      ApiService.getArticles(sort: 'popular', limit: 6, category: 'โภชนาการ'),
      ApiService.getArticles(sort: 'popular', limit: 6, category: 'ทั่วไป'),
      ApiService.getArticles(sort: 'popular', limit: 6, category: 'จิตใจ'),
      PartnerService.getPartners(),
      PartnerService.getAllSocialProjects(),
    ]);
    final rewardsMap = await RewardService.getAvailableRewards(widget.phoneNumber);
    if (mounted) {
      final raw = rewardsMap['rewards'];
      setState(() {
        _benefitBanners = results[0];
        _announcementBanners = results[1];
        _specialOfferBanners = results[2];
        _sponsorBanners = results[3];
        _partnerJobs = results[4];
        _generalBanners = results[5];
        _popularHealthArticles = results[6];
        _popularNutritionArticles = results[7];
        _popularGeneralArticles = results[8];
        _popularMindArticles = results[9];
        _partners = results[10];
        _socialProjects = results[11];
        _availableRewards = (raw is List)
            ? raw.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
            : [];
        _loadingBanners = false;
      });
      _startAnnouncementCarousel();
    }
  }

  void _startAnnouncementCarousel() {
    _annTimer?.cancel();
    if (_announcementBanners.isEmpty) return;
    _annTimer = Timer.periodic(const Duration(milliseconds: 3500), (_) {
      if (!mounted || _announcementBanners.isEmpty) return;
      final count = _announcementBanners.length.clamp(1, 6);
      final next = (_annPage + 1) % count;
      _annPageCtrl.animateToPage(
        next,
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeInOut,
      );
    });
  }

  Future<void> _registerFcmToken() async {
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        await AdService.registerFcmToken(
          phone: widget.phoneNumber,
          token: token,
        );
      }

      FirebaseMessaging.instance.onTokenRefresh.listen((refreshedToken) {
        AdService.registerFcmToken(
          phone: widget.phoneNumber,
          token: refreshedToken,
        );
      });
    } catch (_) {}
  }

  Future<void> _schedulePopupAds() async {
    final ads = await AdService.getPopupAds();
    if (ads.isEmpty || !mounted) return;

    // Show exactly one randomly-picked ad per app open, instead of
    // stacking every configured ad's dialog on top of each other.
    final ad = ads[Random().nextInt(ads.length)];

    final configuredDelay = ad['display_delay_seconds'] is int
        ? ad['display_delay_seconds'] as int
        : int.tryParse(ad['display_delay_seconds']?.toString() ?? '0') ?? 0;
    // Give the home page a moment to render before an ad appears,
    // even if the partner content wasn't configured with a delay.
    const minDelaySec = 3;
    final delaySec =
        configuredDelay < minDelaySec ? minDelaySec : configuredDelay;

    final t = Timer(Duration(seconds: delaySec), () async {
      if (mounted) await PartnerAdPopup.show(context, ad);
    });
    _popupTimers.add(t);
  }

  Future<void> _checkBlockedStatus() async {
    try {
      final status = await ApiService.getModerationStatus(widget.phoneNumber);
      if (!mounted) return;
      setState(() {
        _isBlocked = status['is_blocked'] == true;
        _blockedReason = (status['blocked_reason'] ?? '').toString();
        _warningNote = (status['warning_note'] ?? '').toString();
      });
      if (_isBlocked && mounted) _showBlockedDialog();
    } catch (_) {}
  }

  void _showBlockedDialog() {
    final userName = userData?['full_name'] ?? 'บัญชีของคุณ';
    final msg = _warningNote.isNotEmpty
        ? _warningNote
        : (_blockedReason.isNotEmpty
              ? _blockedReason
              : 'บัญชีนี้ถูกจำกัดการมีส่วนร่วมชั่วคราว');
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        title: Row(
          children: [
            Icon(Icons.warning_amber_rounded, color: Colors.red[700], size: 28),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'สังเกตการณ์ที่สำคัญ',
                style: TextStyle(color: Colors.red[700], fontSize: 18),
              ),
            ),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'บัญชี "$userName" ถูกบล็อคโดยผู้ดูแลแอป',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red[50],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.red[200]!),
                ),
                child: Text(
                  msg,
                  style: const TextStyle(fontSize: 14, height: 1.5),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(
              'ปิด',
              style: TextStyle(
                color: Colors.blue[700],
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _startSessionTimer() {
    _sessionTimer?.cancel();
    _sessionTimer = Timer.periodic(const Duration(minutes: 1), (_) async {
      final hb = await RewardService.heartbeat(widget.phoneNumber);
      if (hb != null && mounted) {
        final pts = _asInt(hb['points_just_awarded']);
        setState(() {
          final total = hb['today_total_elapsed_minutes'];
          _sessionElapsed = _asInt(
            total ?? hb['elapsed_minutes'],
            fallback: _sessionElapsed,
          );
          _minutesToNextPoint = _asInt(
            hb['minutes_to_next_point'],
            fallback: _minutesToNextPoint,
          );
        });
        if (pts > 0) {
          _showPointsSnackbar('⏱️ ใช้งานครบเวลา ได้รับ +$pts แต้ม!');
          if (_asBool(hb['daily_limit_reached'])) {
            _showPointsSnackbar(
              'ครบโควตาแต้มเวลาใช้งานวันนี้แล้ว (สูงสุด $_usageDailyMaxPoints แต้ม)',
            );
          }
          loadRewardSummary();
        }
      }
    });
  }

  void loadUser() async {
    final results = await Future.wait([
      ApiService.getUserProfile(widget.phoneNumber),
      ApiService.getProfilePictureUrl(widget.phoneNumber),
    ]);
    if (mounted) {
      setState(() {
        userData = results[0] as Map<String, dynamic>?;
        isLoadingUser = false;
        final pic = results[1] as String?;
        if (pic != null && pic.isNotEmpty) _profilePictureUrl = pic;
      });
    }
  }

  String _getTimeGreeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'สวัสดีตอนเช้า';
    if (h < 17) return 'สวัสดีตอนบ่าย';
    return 'สวัสดีตอนเย็น';
  }

  String _getTimeSubtitle() {
    final h = DateTime.now().hour;
    if (h < 12) return 'ปลุกตัว สดใส วันใหม่';
    if (h < 17) return 'พักสายตา หายใจลึกๆ';
    return 'ผ่อนคลาย สบายใจ';
  }

  Future<void> _loadRewardSettings() async {
    final settings = await RewardService.getRewardSettings();
    if (mounted && settings.isNotEmpty) {
      final threshold = _asInt(
        settings['session_bonus_threshold'],
        fallback: 40,
      );
      final ppr = _asInt(settings['session_bonus_points'], fallback: 8);
      final limitCount = _asInt(
        settings['usage_reward_daily_limit_count'],
        fallback: 2,
      );
      final maxPts = _asInt(
        settings['usage_reward_daily_max_points'],
        fallback: ppr * limitCount,
      );
      setState(() {
        _rewardThreshold = threshold;
        _minutesToNextPoint = threshold;
        _pointsPerReward = ppr;
        _usageDailyLimitCount = limitCount;
        _usageDailyMaxPoints = maxPts;
      });
    }
  }

  Future<void> loadRewardSummary() async {
    final data = await RewardService.getSummary(widget.phoneNumber);
    if (mounted) setState(() => rewardSummary = data);
  }

  Future<void> _doCheckin() async {
    setState(() => isCheckingIn = true);
    final result = await RewardService.dailyCheckin(widget.phoneNumber);
    setState(() => isCheckingIn = false);
    if (result['error'] != null) {
      _showPointsSnackbar('เกิดข้อผิดพลาด: ${result['error']}', isError: true);
      return;
    }
    await loadRewardSummary();
    _showPointsSnackbar(result['message'] ?? 'เช็คอินสำเร็จ!');
  }

  void _showPointsSnackbar(String msg, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg, style: const TextStyle(fontWeight: FontWeight.w600)),
        backgroundColor: isError ? Colors.red : const Color(0xFF2E7D32),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        duration: const Duration(seconds: 3),
      ),
    );
  }

  // ── Build ──

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F5F5),
      body: Stack(
        children: [
          IndexedStack(
            index: _currentTab,
            children: [
              _buildHomeContent(),
              CommunityPage(phoneNumber: widget.phoneNumber),
              NotificationPage(phoneNumber: widget.phoneNumber),
              ProfilePage(
                phoneNumber: widget.phoneNumber,
                currentUserPhone: widget.phoneNumber,
              ),
            ],
          ),
          ActivityRewardsChecker(
            phoneNumber: widget.phoneNumber,
            onRewardEarned: loadRewardSummary,
          ),
        ],
      ),
      bottomNavigationBar: _buildBottomNav(),
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // HOME CONTENT
  // ─────────────────────────────────────────────────────────────────

  Widget _buildHomeContent() {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildHeader(),
          // RewardStatsRow is commented out per request to hide the points box
          /*
          RewardStatsRow(
            totalPoints: _asDouble(rewardSummary?['total_points']),
            redeemedCount: _asInt(rewardSummary?['redeemed_count']),
            onCommunityTap: () => setState(() => _currentTab = 1),
            onActivityTap: () {},
          ),
          */
          const SizedBox(height: 12),
          if (_showSessionBanner) ...[
            SessionBanner(
              sessionElapsedMinutes: _sessionElapsed,
              minutesToNextPoint: _minutesToNextPoint,
              sessionBonusThreshold: _rewardThreshold,
              pointsPerReward: _pointsPerReward,
              dailyAwardedPoints: _asInt(
                rewardSummary?['today_app_usage_points'],
              ),
              maxDailyPoints: _usageDailyMaxPoints,
              dailyLimitCount: _usageDailyLimitCount,
              onClose: () => setState(() => _showSessionBanner = false),
            ),
            const SizedBox(height: 12),
          ],
          _buildBenefitsSection(),
          const SizedBox(height: 12),
          _buildRedeemableBenefitsSection(),
          const SizedBox(height: 12),
          _buildJobOpportunitiesSection(),
          const SizedBox(height: 12),
          _buildSocialProjectsSection(),
          const SizedBox(height: 12),
          DailyCheckInCard(
            streak: _asInt(rewardSummary?['login_streak']),
            checkedToday: _asBool(rewardSummary?['checked_in_today']),
            dailyPoints: _asDouble(
              rewardSummary?['daily_points'],
              fallback: 1.0,
            ),
            daysLeftToBonus: _asInt(
              rewardSummary?['next_streak_bonus']?['days_left'],
            ),
            nextBonusDay: _asInt(
              rewardSummary?['next_streak_bonus']?['at_day'],
              fallback: 10,
            ),
            streakMilestoneDay: _asInt(
              rewardSummary?['streak_milestone_day'],
              fallback: 30,
            ),
            streakMilestoneBonus: _asInt(
              rewardSummary?['streak_milestone_bonus'],
              fallback: 2,
            ),
            isLoading: isCheckingIn,
            onCheckIn: _doCheckin,
          ),
          const SizedBox(height: 12),
          _buildSpecialOfferSection(),
          const SizedBox(height: 12),
          _buildAnnouncementsSection(),
          const SizedBox(height: 12),
          _buildHealthCategoriesSection(),
          const SizedBox(height: 12),
          _buildPopularArticlesSection('บทความทั่วไปที่คนสนใจ', _popularGeneralArticles, 'ทั่วไป'),
          const SizedBox(height: 12),
          _buildPopularArticlesSection('บทความสุขภาพที่คนสนใจ', _popularHealthArticles, 'สุขภาพ'),
          const SizedBox(height: 12),
          _buildPopularArticlesSection('บทความโภชนาการที่คนสนใจ', _popularNutritionArticles, 'โภชนาการ'),
          const SizedBox(height: 12),
          _buildPopularArticlesSection('บทความจิตใจที่คนสนใจ', _popularMindArticles, 'จิตใจ'),
          const SizedBox(height: 12),
          _buildCoursesSection(),
          const SizedBox(height: 12),
          _buildSponsorsSection(),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  // ── Header ──

  Widget _buildHeader() {
    final name = userData?['full_name'] ?? '';
    final greeting = _getTimeGreeting();
    final subtitle = _getTimeSubtitle();

    return Container(
      decoration: const BoxDecoration(
        image: DecorationImage(
          image: NetworkImage(
            'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800',
          ),
          fit: BoxFit.cover,
          colorFilter: ColorFilter.mode(Colors.black45, BlendMode.darken),
        ),
      ),
      padding: EdgeInsets.only(
        top: MediaQuery.of(context).padding.top + 8,
        left: 16,
        right: 16,
        bottom: 20,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Top bar: greeting tag + settings
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: Colors.white38),
                ),
                child: const Text(
                  'ยินดีต้อนรับ',
                  style: TextStyle(color: Colors.white, fontSize: 12),
                ),
              ),
              Row(
                children: [
                  ValueListenableBuilder<bool>(
                    valueListenable:
                        AppSettingsService.instance.elderModeNotifier,
                    builder: (context, isElder, _) {
                      return GestureDetector(
                        onTap: () => AppSettingsService.instance
                            .setElderMode(!isElder),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: isElder
                                ? Colors.orange.withValues(alpha: 0.85)
                                : Colors.blueGrey.shade700
                                    .withValues(alpha: 0.85),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: Colors.white38),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                isElder
                                    ? Icons.accessibility_new
                                    : Icons.person_outline,
                                color: Colors.white,
                                size: 14,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                isElder ? 'ผู้สูงอายุ' : 'ปกติ',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) =>
                            AppSettingsPage(phoneNumber: widget.phoneNumber),
                      ),
                    ),
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(
                        Icons.settings_rounded,
                        color: Colors.white,
                        size: 22,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Profile row
          Row(
            children: [
              Container(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 2.5),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.25),
                      blurRadius: 8,
                      offset: const Offset(0, 3),
                    ),
                  ],
                ),
                child: CircleAvatar(
                  radius: 32,
                  backgroundColor: const Color(0xFF4CAF50),
                  backgroundImage:
                      (_profilePictureUrl != null &&
                          _profilePictureUrl!.isNotEmpty)
                      ? NetworkImage(_profilePictureUrl!)
                      : null,
                  child:
                      (_profilePictureUrl == null ||
                          _profilePictureUrl!.isEmpty)
                      ? const Icon(Icons.person, color: Colors.white, size: 36)
                      : null,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '$greeting${name.isNotEmpty ? ' คุณ$name' : ''}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        shadows: [Shadow(color: Colors.black38, blurRadius: 4)],
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ── Section Header ──

  Widget _buildSectionHeader(
    String title, {
    String? trailing,
    VoidCallback? onTrailingTap,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          if (trailing != null)
            GestureDetector(
              onTap: onTrailingTap,
              child: Text(
                trailing,
                style: const TextStyle(fontSize: 13, color: Color(0xFF1565C0)),
              ),
            ),
        ],
      ),
    );
  }

  // ── Benefits Section (from home_banners type=benefits) ──

  Widget _buildBenefitsSection() {
    if (_loadingBanners) return const SizedBox.shrink();
    if (_benefitBanners.isEmpty) return const SizedBox.shrink();
    return Column(
      children: [
        _buildSectionHeader(
          'สิทธิประโยชน์สำหรับคุณ',
          trailing: 'ดูทั้งหมด',
          onTrailingTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AllPartnersPage())),
        ),
        SizedBox(
          height: 160,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: _benefitBanners.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (ctx, i) =>
                _buildDynamicBenefitCard(_benefitBanners[i]),
          ),
        ),
      ],
    );
  }

  Widget _buildDynamicBenefitCard(Map<String, dynamic> b) {
    final imgUrl = PartnerService.resolveImageUrl(b['image_url']);
    final partnerId = b['partner_id'];
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
        width: 200,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.08),
              blurRadius: 6,
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Stack(
            children: [
              if (imgUrl.isNotEmpty)
                Image.network(
                  imgUrl,
                  width: 200,
                  height: 160,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) =>
                      Container(color: const Color(0xFF1B5E20)),
                )
              else
                Container(
                  width: 200,
                  height: 160,
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Color(0xFF1B5E20), Color(0xFF388E3C)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                  ),
                ),
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.bottomCenter,
                      end: Alignment.topCenter,
                      colors: [
                        Colors.black.withValues(alpha: 0.7),
                        Colors.transparent,
                      ],
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if ((b['title']?.toString() ?? '').isNotEmpty)
                        Text(
                          b['title'].toString(),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 13,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      if (b['partner_name'] != null)
                        Text(
                          b['partner_name'].toString(),
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 11,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Redeemable Benefits (from available rewards) ──

  Widget _buildRedeemableBenefitsSection() {
    if (_loadingBanners || _availableRewards.isEmpty) return const SizedBox.shrink();
    return Column(
      children: [
        _buildSectionHeader(
          'สิทธิประโยชน์สำหรับคุณ',
          trailing: 'ดูทั้งหมด',
          onTrailingTap: () => Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => RewardHistoryPage(phoneNumber: widget.phoneNumber, initialView: 2),
            ),
          ),
        ),
        SizedBox(
          height: 220,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: _availableRewards.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (ctx, i) => _buildRewardCard(_availableRewards[i]),
          ),
        ),
      ],
    );
  }

  Widget _buildRewardCard(Map<String, dynamic> r) {
    final imgUrl = PartnerService.resolveImageUrl(r['image_url']);
    final pts = _asInt(r['points_required']);
    final name = r['reward_name']?.toString().trim().isNotEmpty == true
        ? r['reward_name'].toString()
        : (r['name']?.toString().trim().isNotEmpty == true ? r['name'].toString() : 'สิทธิประโยชน์');
    final desc = _clean(r['description']?.toString() ?? '');
    const blue = Color(0xFF1565C0);
    return Container(
      width: 180,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 6)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
            child: SizedBox(
              height: 110,
              width: 180,
              child: imgUrl.isNotEmpty
                  ? Image.network(
                      imgUrl,
                      width: 180,
                      height: 110,
                      fit: BoxFit.cover,
                      alignment: Alignment.center,
                      errorBuilder: (_, __, ___) => Container(
                        color: blue.withValues(alpha: 0.08),
                        child: const Center(child: Icon(Icons.card_giftcard, size: 36, color: Color(0xFF1B5E20))),
                      ))
                  : Container(
                      color: blue.withValues(alpha: 0.08),
                      child: const Center(child: Icon(Icons.card_giftcard, size: 36, color: Color(0xFF1B5E20))),
                    ),
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.black87),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (desc.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      desc,
                      style: const TextStyle(fontSize: 10, color: Colors.grey),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.amber.shade50,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: Colors.amber.shade300),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.star_rounded, size: 11, color: Colors.amber.shade700),
                            const SizedBox(width: 2),
                            Text('$pts', style: TextStyle(fontSize: 10, color: Colors.amber.shade800, fontWeight: FontWeight.bold)),
                          ],
                        ),
                      ),
                      const Spacer(),
                      GestureDetector(
                        onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => RewardHistoryPage(phoneNumber: widget.phoneNumber, initialView: 2),
                          ),
                        ),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: blue,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: const [
                              Icon(Icons.shopping_cart_outlined, size: 12, color: Colors.white),
                              SizedBox(width: 3),
                              Text('แลกเลย', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Job Opportunities (from partner_jobs) ──

  Widget _buildJobOpportunitiesSection() {
    if (_loadingBanners || _partnerJobs.isEmpty) return const SizedBox.shrink();
    return Column(
      children: [
        _buildSectionHeader(
          'โอกาสใหม่ในการทำงาน',
          trailing: 'ดูทั้งหมด',
          onTrailingTap: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const AllOpportunitiesPage()),
          ),
        ),
        SizedBox(
          height: 108,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: _partnerJobs.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (ctx, i) => _buildJobScrollCard(_partnerJobs[i]),
          ),
        ),
        const SizedBox(height: 4),
      ],
    );
  }

  Widget _buildJobScrollCard(Map<String, dynamic> j) {
    final logoUrl = PartnerService.resolveImageUrl(j['partner_logo']);
    final partnerId = j['partner_id'];
    const green = Color(0xFF1B5E20);
    const btnColor = Color(0xFF1565C0);
    final typeLocation = [j['job_type'], j['location']]
        .where((v) => v != null && v.toString().isNotEmpty)
        .join(' · ');
    return Container(
      width: 268,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.07),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          GestureDetector(
            onTap: partnerId != null
                ? () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) =>
                            PartnerPage(partnerId: partnerId as int),
                      ),
                    )
                : null,
            child: Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: green.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(10),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: logoUrl.isNotEmpty
                    ? Image.network(
                        logoUrl,
                        fit: BoxFit.contain,
                        errorBuilder: (_, __, ___) =>
                            const Icon(Icons.store, color: Colors.grey),
                      )
                    : const Icon(Icons.store, color: Colors.grey),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  j['title']?.toString() ?? '',
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w600),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  j['partner_name']?.toString() ?? '',
                  style: const TextStyle(
                      fontSize: 12,
                      color: green,
                      fontWeight: FontWeight.w500),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (typeLocation.isNotEmpty)
                  Text(
                    typeLocation,
                    style: const TextStyle(fontSize: 11, color: Colors.grey),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
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
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) =>
                        PartnerPage(partnerId: partnerId as int),
                  ),
                );
              }
            },
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              decoration: BoxDecoration(
                color: btnColor,
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Text(
                'สมัคร',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.bold),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Social Projects (all partners) ──

  Widget _buildSocialProjectsSection() {
    if (_loadingBanners || _socialProjects.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader(
          'โครงการเพื่อสังคม',
          trailing: 'ดูทั้งหมด',
          onTrailingTap: () => Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) =>
                  AllSocialProjectsPage(projects: _socialProjects),
            ),
          ),
        ),
        ValueListenableBuilder<bool>(
          valueListenable: AppSettingsService.instance.elderModeNotifier,
          builder: (context, isElder, _) {
            final listH = isElder ? 292.0 : 264.0;
            return SizedBox(
              height: listH,
              child: PageView.builder(
                controller: _socialPageCtrl,
                itemCount: _socialProjects.length,
                onPageChanged: (i) => setState(() => _socialPage = i),
                itemBuilder: (ctx, i) => Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  child: _buildSocialProjectCard(_socialProjects[i], isElder: isElder),
                ),
              ),
            );
          },
        ),
        if (_socialProjects.length > 1) ...[
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(
              _socialProjects.length,
              (i) => AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                margin: const EdgeInsets.symmetric(horizontal: 3),
                width: _socialPage == i ? 16 : 6,
                height: 6,
                decoration: BoxDecoration(
                  color: _socialPage == i
                      ? const Color(0xFF1B5E20)
                      : Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
          ),
        ],
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _buildSocialProjectCard(
    Map<String, dynamic> p, {
    bool isElder = false,
  }) {
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
          color: const Color(0xFFE8F5E9),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFA5D6A7)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Image area (always 110dp) ──
            ClipRRect(
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(12)),
              child: imgUrl.isNotEmpty
                  ? Image.network(
                      imgUrl,
                      width: double.infinity,
                      height: 110,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) =>
                          _socialImgPlaceholder(),
                    )
                  : _socialImgPlaceholder(),
            ),
            // ── Content area ──
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Partner name
                  if (partnerName.isNotEmpty) ...[
                    Row(
                      children: [
                        if (logoUrl.isNotEmpty)
                          Container(
                            width: 28,
                            height: 28,
                            margin: const EdgeInsets.only(right: 6),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(
                                  color: Colors.grey.shade200),
                            ),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(6),
                              child: Image.network(logoUrl,
                                  fit: BoxFit.contain,
                                  errorBuilder: (_, __, ___) =>
                                      const SizedBox.shrink()),
                            ),
                          ),
                        Flexible(
                          child: Text(
                            partnerName,
                            style: TextStyle(
                              fontSize: isElder ? 12 : 11,
                              color: const Color(0xFF1B5E20),
                              fontWeight: FontWeight.w600,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                  ],
                  // Icon + title/desc/button row
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: const Color(0xFF1B5E20)
                              .withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.volunteer_activism,
                            color: Color(0xFF1B5E20), size: 20),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              title,
                              style: TextStyle(
                                fontSize: isElder ? 14 : 13,
                                fontWeight: FontWeight.bold,
                                color: Colors.black87,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            if (desc.isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text(
                                desc,
                                style: TextStyle(
                                  fontSize: isElder ? 12 : 11,
                                  color: const Color(0xFF555555),
                                  height: 1.4,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                            const SizedBox(height: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 6),
                              decoration: BoxDecoration(
                                color: const Color(0xFF1565C0),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text(
                                'ดูรายละเอียด',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: isElder ? 12 : 11,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _socialImgPlaceholder() {
    return Container(
      width: double.infinity,
      height: 110,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF1B5E20), Color(0xFF2E7D32)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: const Center(
        child: Icon(Icons.volunteer_activism, size: 40, color: Colors.white30),
      ),
    );
  }

  // ── Special Offer (from home_banners type=special_offer) ──

  Widget _buildSpecialOfferSection() {
    if (_loadingBanners || _specialOfferBanners.isEmpty)
      return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader('ข้อเสนอพิเศษ'),
        ..._specialOfferBanners.take(2).map(_buildSpecialOfferCard),
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _buildSpecialOfferCard(Map<String, dynamic> b) {
    final imgUrl = PartnerService.resolveImageUrl(b['image_url']);
    final partnerId = b['partner_id'];
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
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.08),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Stack(
            children: [
              if (imgUrl.isNotEmpty)
                Image.network(
                  imgUrl,
                  width: double.infinity,
                  height: 160,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    height: 160,
                    color: Colors.grey.shade200,
                    child: const Center(
                      child: Icon(
                        Icons.local_offer,
                        size: 40,
                        color: Colors.grey,
                      ),
                    ),
                  ),
                )
              else
                Container(height: 160, color: Colors.grey.shade200),
              // Promo badge
              Positioned(
                top: 10,
                left: 10,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.orange.shade700,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text(
                    'โปรโมชั่นเด่น',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ),
              // Bottom gradient + text
              if ((b['title']?.toString() ?? '').isNotEmpty)
                Positioned(
                  bottom: 0,
                  left: 0,
                  right: 0,
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(14, 24, 14, 12),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.bottomCenter,
                        end: Alignment.topCenter,
                        colors: [
                          Colors.black.withValues(alpha: 0.75),
                          Colors.transparent,
                        ],
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          b['title'].toString(),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if ((b['description']?.toString() ?? '')
                            .isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            _clean(b['description'].toString()),
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 12,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Announcements (from home_banners type=announcement) ──

  Widget _buildAnnouncementsSection() {
    if (_loadingBanners || _announcementBanners.isEmpty)
      return const SizedBox.shrink();
    final shown = _announcementBanners.take(6).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader(
          'ประชาสัมพันธ์',
          trailing: 'ดูทั้งหมด',
          onTrailingTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AllAnnouncementsPage())),
        ),
        SizedBox(
          height: 180,
          child: PageView.builder(
            controller: _annPageCtrl,
            itemCount: shown.length,
            onPageChanged: (i) {
              setState(() => _annPage = i);
              final id = shown[i]['id'];
              if (id != null) PartnerService.trackBannerView(id as int);
            },
            itemBuilder: (ctx, i) => Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              child: _buildAnnouncementCard(shown[i]),
            ),
          ),
        ),
        if (shown.length > 1) ...[
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(shown.length, (i) => AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: _annPage == i ? 16 : 6,
              height: 6,
              decoration: BoxDecoration(
                color: _annPage == i
                    ? const Color(0xFF1565C0)
                    : Colors.grey.shade300,
                borderRadius: BorderRadius.circular(3),
              ),
            )),
          ),
        ],
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _buildAnnouncementCard(Map<String, dynamic> b) {
    final imgUrl = PartnerService.resolveImageUrl(b['image_url']);
    final partnerId = b['partner_id'];
    final bannerId = b['id'];
    return GestureDetector(
      onTap: () {
        if (bannerId != null) PartnerService.trackBannerClick(bannerId as int);
        if (partnerId != null) {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => PartnerPage(partnerId: partnerId as int),
            ),
          );
        }
      },
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.08),
              blurRadius: 6,
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: Stack(
            children: [
              if (imgUrl.isNotEmpty)
                SizedBox(
                  width: double.infinity,
                  height: 180,
                  child: Image.network(
                    imgUrl,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      color: Colors.grey.shade200,
                      child: const Center(
                        child: Icon(Icons.image, size: 40, color: Colors.grey),
                      ),
                    ),
                  ),
                )
              else
                Container(height: 180, color: Colors.grey.shade200),
              if ((b['title']?.toString() ?? '').isNotEmpty)
                Positioned(
                  bottom: 0,
                  left: 0,
                  right: 0,
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.bottomCenter,
                        end: Alignment.topCenter,
                        colors: [
                          Colors.black.withValues(alpha: 0.65),
                          Colors.transparent,
                        ],
                      ),
                    ),
                    child: Text(
                      b['title'].toString(),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Health Categories ──

  // ── Popular Articles ──

  String _resolveArticleImage(String? raw) {
    if (raw == null || raw.isEmpty) return '';
    if (raw.startsWith('http')) return raw;
    final base = AppConfig.serverBaseUrl;
    return '$base/uploads/$raw';
  }

  Widget _buildPopularArticlesSection(
    String title,
    List<Map<String, dynamic>> articles,
    String category,
  ) {
    if (articles.isEmpty) return const SizedBox.shrink();
    return ValueListenableBuilder<bool>(
      valueListenable: AppSettingsService.instance.elderModeNotifier,
      builder: (context, isElder, _) {
        final listHeight = isElder ? 272.0 : 230.0;
        final cardWidth = isElder ? 200.0 : 180.0;
        final imgHeight = isElder ? 118.0 : 106.0;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildSectionHeader(
              title,
              trailing: 'ดูทั้งหมด',
              onTrailingTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => HealthPage(
                    phoneNumber: widget.phoneNumber,
                    initialCategory: category,
                  ),
                ),
              ),
            ),
            SizedBox(
              height: listHeight,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
                itemCount: articles.length,
                separatorBuilder: (_, __) => const SizedBox(width: 12),
                itemBuilder: (context, i) {
                  final a = articles[i];
                  final imageUrl = _resolveArticleImage(a['cover_image'] as String?);
                  final title = a['title']?.toString() ?? '';
                  final views = _asInt(a['view_count']);
                  final likes = _asInt(a['like_count']);
                  final category = a['category']?.toString() ?? '';
                  final isPartner = a['source_type']?.toString() == 'partner';
                  final partnerName = a['partner_name']?.toString() ?? '';
                  final author = isPartner
                      ? partnerName
                      : (a['submitter_name']?.toString() ?? a['author_name']?.toString() ?? '');

                  return GestureDetector(
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => ArticleDetailPage(
                          articleId: _asInt(a['article_id']),
                          phoneNumber: widget.phoneNumber,
                        ),
                      ),
                    ),
                    child: Container(
                      width: cardWidth,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.08),
                            blurRadius: 10,
                            offset: const Offset(0, 3),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // ── Thumbnail with category overlay ──
                          Stack(
                            children: [
                              ClipRRect(
                                borderRadius: const BorderRadius.vertical(
                                    top: Radius.circular(16)),
                                child: imageUrl.isNotEmpty
                                    ? Image.network(
                                        imageUrl,
                                        width: cardWidth,
                                        height: imgHeight,
                                        fit: BoxFit.cover,
                                        errorBuilder: (_, __, ___) =>
                                            _articleThumbPlaceholder(
                                                cardWidth, imgHeight),
                                      )
                                    : _articleThumbPlaceholder(
                                        cardWidth, imgHeight),
                              ),
                              // Category chip overlay
                              if (category.isNotEmpty)
                                Positioned(
                                  top: 8,
                                  left: 8,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 7, vertical: 3),
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF1565C0)
                                          .withValues(alpha: 0.88),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: Text(
                                      category,
                                      style: const TextStyle(
                                        fontSize: 10,
                                        color: Colors.white,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                          // ── Info ──
                          Padding(
                            padding:
                                const EdgeInsets.fromLTRB(10, 9, 10, 10),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  title,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                    height: 1.35,
                                    color: Color(0xFF1A1A2E),
                                  ),
                                ),
                                const SizedBox(height: 6),
                                // Author / partner
                                Row(
                                  children: [
                                    Icon(
                                      isPartner
                                          ? Icons.business_outlined
                                          : Icons.person_outline,
                                      size: 12,
                                      color: Colors.grey[500],
                                    ),
                                    const SizedBox(width: 4),
                                    Expanded(
                                      child: Text(
                                        author,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          fontSize: 11,
                                          color: Colors.grey[500],
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                // Stats
                                Row(
                                  children: [
                                    Icon(Icons.remove_red_eye_outlined,
                                        size: 13, color: Colors.grey[400]),
                                    const SizedBox(width: 3),
                                    Text(
                                      '$views',
                                      style: TextStyle(
                                          fontSize: 11,
                                          color: Colors.grey[500]),
                                    ),
                                    const SizedBox(width: 10),
                                    Icon(Icons.favorite_outline,
                                        size: 13,
                                        color: Colors.red[300]),
                                    const SizedBox(width: 3),
                                    Text(
                                      '$likes',
                                      style: TextStyle(
                                          fontSize: 11,
                                          color: Colors.grey[500]),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _articleThumbPlaceholder(double width, double height) {
    return Container(
      width: width,
      height: height,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFE3F2FD), Color(0xFFBBDEFB)],
        ),
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      child: const Icon(Icons.article_outlined, size: 38, color: Color(0xFF90CAF9)),
    );
  }

  Widget _buildHealthCategoriesSection() {
    const cats = [
      {'icon': Icons.grid_view_rounded, 'label': 'ทั่วไป', 'color': 0xFF1E88E5},
      {'icon': Icons.favorite, 'label': 'สุขภาพ', 'color': 0xFFE53935},
      {'icon': Icons.restaurant_menu, 'label': 'โภชนาการ', 'color': 0xFFF4511E},
      {'icon': Icons.psychology, 'label': 'จิตใจ', 'color': 0xFF4CAF50},
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader('สุขภาพและการดูแลตนเอง'),
        Container(
          margin: const EdgeInsets.symmetric(horizontal: 16),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.06),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: cats
                .map(
                  (c) => _buildHealthTile(
                    icon: c['icon'] as IconData,
                    label: c['label'] as String,
                    color: Color(c['color'] as int),
                  ),
                )
                .toList(),
          ),
        ),
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _buildHealthTile({
    required IconData icon,
    required String label,
    required Color color,
  }) {
    return GestureDetector(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => HealthPage(
            phoneNumber: widget.phoneNumber,
            initialCategory: label,
          ),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, color: color, size: 28),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }

  // ── Courses (from home_banners type=general) ──

  Widget _buildCoursesSection() {
    if (_loadingBanners || _generalBanners.isEmpty)
      return const SizedBox.shrink();
    return ValueListenableBuilder<bool>(
      valueListenable: AppSettingsService.instance.elderModeNotifier,
      builder: (context, isElder, _) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildSectionHeader('คอร์สเรียนรู้', trailing: 'ดูทั้งหมด'),
            SizedBox(
              height: isElder ? 210 : 170,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: _generalBanners.length,
                separatorBuilder: (_, __) => const SizedBox(width: 12),
                itemBuilder: (ctx, i) => _buildCourseCard(_generalBanners[i]),
              ),
            ),
            const SizedBox(height: 8),
          ],
        );
      },
    );
  }

  Widget _buildCourseCard(Map<String, dynamic> b) {
    final imgUrl = PartnerService.resolveImageUrl(b['image_url']);
    final partnerId = b['partner_id'];
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
        width: 160,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.08),
              blurRadius: 6,
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(14),
              ),
              child: imgUrl.isNotEmpty
                  ? Image.network(
                      imgUrl,
                      width: 160,
                      height: 100,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        width: 160,
                        height: 100,
                        color: Colors.grey.shade100,
                        child: const Icon(
                          Icons.school,
                          size: 36,
                          color: Colors.grey,
                        ),
                      ),
                    )
                  : Container(
                      width: 160,
                      height: 100,
                      color: Colors.grey.shade100,
                      child: const Icon(
                        Icons.school,
                        size: 36,
                        color: Colors.grey,
                      ),
                    ),
            ),
            Padding(
              padding: const EdgeInsets.all(8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    b['title']?.toString() ?? '',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (b['partner_name'] != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      b['partner_name'].toString(),
                      style: const TextStyle(fontSize: 10, color: Colors.grey),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
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

  // ── Sponsors (from partners table) ──

  static const _tierOrder = {'platinum': 0, 'gold': 1, 'silver': 2, 'none': 3};

  Widget _buildSponsorsSection() {
    if (_loadingBanners || _partners.isEmpty)
      return const SizedBox.shrink();
    final sorted = [..._partners]..sort((a, b) {
        final ta = _tierOrder[a['tier']?.toString() ?? 'none'] ?? 3;
        final tb = _tierOrder[b['tier']?.toString() ?? 'none'] ?? 3;
        return ta.compareTo(tb);
      });
    return Column(
      children: [
        _buildSectionHeader(
          'ผู้สนับสนุน',
          trailing: 'ดูทั้งหมด',
          onTrailingTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AllPartnersPage())),
        ),
        Container(
          margin: const EdgeInsets.symmetric(horizontal: 16),
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.06),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: sorted
                  .map((p) => Padding(
                        padding: const EdgeInsets.only(right: 12),
                        child: _buildSponsorItem(p),
                      ))
                  .toList(),
            ),
          ),
        ),
      ],
    );
  }

  static Color _tierBorderColor(String? tier) {
    switch (tier) {
      case 'platinum': return const Color(0xFFB0BEC5);
      case 'gold':     return const Color(0xFFF9A825);
      case 'silver':   return const Color(0xFF9E9E9E);
      default:         return const Color(0xFFE0E0E0);
    }
  }

  Widget _buildSponsorItem(Map<String, dynamic> p) {
    final imgUrl = PartnerService.resolveImageUrl(p['logo_url']);
    final partnerId = p['id'];
    final tier = p['tier']?.toString();
    final hasTier = tier != null && tier != 'none';
    final borderColor = _tierBorderColor(tier);
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
        width: 56,
        height: 40,
        decoration: BoxDecoration(
          color: Colors.grey.shade100,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: borderColor,
            width: hasTier ? 2.0 : 1.0,
          ),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(7),
          child: imgUrl.isNotEmpty
              ? Image.network(
                  imgUrl,
                  fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) =>
                      const Icon(Icons.store, size: 18, color: Colors.grey),
                )
              : const Icon(Icons.store, size: 18, color: Colors.grey),
        ),
      ),
    );
  }

  // ── Bottom Nav ──

  Widget _buildBottomNav() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 10,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildNavItem(0, Icons.home, 'หน้าหลัก'),
              _buildNavItem(1, Icons.account_balance_wallet_outlined, 'ชุมชน'),
              _buildNavItem(2, Icons.notifications_outlined, 'แจ้งเตือน'),
              _buildNavItem(3, Icons.person_outline, 'โปรไฟล์'),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem(int index, IconData icon, String label) {
    final isActive = _currentTab == index;
    const activeColor = Color(0xFF3B6FD4);
    return GestureDetector(
      onTap: () => setState(() => _currentTab = index),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        decoration: BoxDecoration(
          color: isActive
              ? activeColor.withValues(alpha: 0.1)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedScale(
              duration: const Duration(milliseconds: 200),
              scale: isActive ? 1.15 : 1.0,
              child: Icon(
                icon,
                size: 24,
                color: isActive ? activeColor : Colors.grey,
              ),
            ),
            const SizedBox(height: 4),
            AnimatedDefaultTextStyle(
              duration: const Duration(milliseconds: 200),
              style: TextStyle(
                fontSize: 11,
                fontWeight: isActive ? FontWeight.w600 : FontWeight.normal,
                color: isActive ? activeColor : Colors.grey,
              ),
              child: Text(label),
            ),
          ],
        ),
      ),
    );
  }
}
