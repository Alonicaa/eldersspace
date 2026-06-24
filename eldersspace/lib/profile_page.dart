import 'package:flutter/foundation.dart';
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';

import 'app_settings_page.dart';
import 'follow_list_page.dart';
import 'reward_history_page.dart';
import 'points_system_page.dart';
import 'services/api_service.dart';
import 'services/app_config.dart';
import 'services/reward_service.dart';
import 'services/tts_stt_service.dart';
import 'post_detail_page.dart';
import 'widgets/comment_dialog.dart';
import 'widgets/post_component.dart';
import 'widgets/share_sheet.dart';
import 'widgets/action_sheet_tile.dart';

class ProfilePage extends StatefulWidget {
  final String phoneNumber;
  final String currentUserPhone;

  const ProfilePage({
    super.key,
    required this.phoneNumber,
    required this.currentUserPhone,
  });

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> with WidgetsBindingObserver {
  Map<String, dynamic>? userData;
  Map<String, dynamic>? profileDetails;
  List<dynamic> posts = [];
  Map<String, dynamic>? rewardSummary;

  bool isLoading = true;
  bool followLoading = false;
  bool isFollowing = false;
  bool isBlocked = false;

  String? avatarUrl;
  String? _speakingId;

  final _tts = TtsSttService.instance;
  final String baseUrl = AppConfig.apiBaseUrl;

  Timer? _refreshTimer;

  bool get isMyProfile => widget.phoneNumber == widget.currentUserPhone;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadAll();
    _refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!mounted) return;
      _loadRewardSummary();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _loadAll();
    }
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _tts.stop();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _loadAll() async {
    if (mounted) {
      setState(() => isLoading = true);
    }

    await Future.wait([
      loadProfile(),
      loadPosts(),
      if (isMyProfile) _loadRewardSummary(),
    ]);

    if (!mounted) return;
    setState(() => isLoading = false);
  }

  Future<void> loadProfile() async {
    Map<String, dynamic> profile = {};
    Map<String, dynamic> stats = {};
    Map<String, dynamic> moderation = {};
    Map<String, dynamic> details = {};
    String? pic;
    bool following = false;

    try {
      profile = await ApiService.getUserProfile(widget.phoneNumber);
    } catch (_) {}

    try {
      stats = await ApiService.getFollowStats(widget.phoneNumber);
    } catch (_) {
      stats = {};
    }

    try {
      moderation = await ApiService.getModerationStatus(widget.phoneNumber);
    } catch (_) {
      moderation = {};
    }

    try {
      pic = await ApiService.getProfilePictureUrl(widget.phoneNumber);
    } catch (_) {
      pic = null;
    }

    try {
      details = await ApiService.getProfileDetails(widget.phoneNumber);
    } catch (_) {
      details = {};
    }

    if (!isMyProfile) {
      try {
        following = await ApiService.checkFollowStatus(
          widget.currentUserPhone,
          widget.phoneNumber,
        );
      } catch (_) {
        following = false;
      }
    }

    if (!mounted) return;
    setState(() {
      userData = {
        ...profile,
        'followers': stats['followers'] ?? profile['followers'] ?? 0,
        'following': stats['following'] ?? profile['following'] ?? 0,
      };
      profileDetails = Map<String, dynamic>.from(
        (profile['profile_details'] as Map?)?.cast<String, dynamic>() ?? {},
      );
      profileDetails = {
        ...?profileDetails,
        ...details,
      };
      avatarUrl = pic ?? profile['profile_picture_url']?.toString();
      isFollowing = following;
      isBlocked = moderation['is_blocked'] == true;
    });
  }

  Future<void> loadPosts() async {
    try {
      final result = await ApiService.getUserPosts(
        widget.phoneNumber,
        viewer: widget.currentUserPhone,
      );
      if (!mounted) return;
      setState(() {
        posts = (result is List) ? result : [];
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        posts = [];
      });
    }
  }

  Future<void> _loadRewardSummary() async {
    if (!isMyProfile) return;
    try {
      final result = await RewardService.getSummary(widget.phoneNumber);
      if (!mounted) return;
      setState(() {
        rewardSummary = (result['data'] is Map<String, dynamic>)
            ? result['data'] as Map<String, dynamic>
            : result;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        rewardSummary = rewardSummary ?? <String, dynamic>{};
      });
    }
  }

  String _rewardPointsText() {
    final summary = rewardSummary;
    if (summary == null) return '0';
    
    // Try different field names that backend might return
    final points = summary['total_points'] ?? summary['points_balance'];
    if (points is num) return points.toInt().toString();

    final nested = summary['summary'];
    if (nested is Map) {
      final nestedPoints = nested['total_points'] ?? nested['points_balance'];
      if (nestedPoints is num) {
        return nestedPoints.toInt().toString();
      }
    }
    return '0';
  }

  Future<void> _toggleFollow() async {
    if (isMyProfile || followLoading) return;

    setState(() => followLoading = true);
    try {
      if (isFollowing) {
        await ApiService.unfollowUser(widget.currentUserPhone, widget.phoneNumber);
      } else {
        await ApiService.followUser(widget.currentUserPhone, widget.phoneNumber);
      }
      await loadProfile();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('ทำรายการไม่สำเร็จ: $e')),
      );
    } finally {
      if (mounted) {
        setState(() => followLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text('โปรไฟล์'),
        elevation: 0.5,
        backgroundColor: Colors.white,
        foregroundColor: Colors.black87,
        centerTitle: false,
        actions: [
          if (isMyProfile)
            IconButton(
              icon: const Icon(Icons.more_vert),
              onPressed: _openMenu,
            ),
        ],
      ),
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadAll,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _buildHeaderSection(),
                    const SizedBox(height: 24),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: _buildStatsSection(),
                    ),
                    const SizedBox(height: 24),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: _buildProfileDetailsSection(),
                    ),
                    const SizedBox(height: 24),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: _buildAboutSection(),
                    ),
                    const SizedBox(height: 28),
                    _buildPostsSection(),
                    const SizedBox(height: 80),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildHeaderSection() {
    final name = (userData?['full_name']?.toString().trim().isNotEmpty == true)
        ? userData!['full_name'].toString()
        : 'ผู้ใช้ EldersSpace';

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [const Color(0xFF3B6FD4), const Color(0xFF5A8FEE)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 28, 16, 40),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            // Profile Picture with Shadow
            Container(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.25),
                    blurRadius: 20,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: CircleAvatar(
                radius: 60,
                backgroundColor: Colors.white,
                backgroundImage: (avatarUrl != null && avatarUrl!.isNotEmpty)
                    ? NetworkImage(avatarUrl!)
                    : null,
                child: (avatarUrl == null || avatarUrl!.isEmpty)
                    ? const Icon(Icons.person, size: 55, color: Color(0xFF3B6FD4))
                    : null,
              ),
            ),
            const SizedBox(height: 20),
            // Name
            Text(
              name,
              style: const TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w900,
                color: Colors.white,
                letterSpacing: 0.8,
              ),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 18),
            // Follow Button or Reward Badge
            if (!isMyProfile)
              SizedBox(
                width: 200,
                child: FilledButton(
                  onPressed: followLoading ? null : _toggleFollow,
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: const Color(0xFF3B6FD4),
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    elevation: 4,
                    shadowColor: Colors.black26,
                  ),
                  child: followLoading
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF3B6FD4)),
                          ),
                        )
                      : Text(
                          isFollowing ? 'กำลังติดตาม' : '+ ติดตาม',
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                            letterSpacing: 0.3,
                          ),
                        ),
                ),
              ),
            if (isMyProfile && rewardSummary != null)
              GestureDetector(
                onTap: () async {
                  await Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => RewardHistoryPage(phoneNumber: widget.phoneNumber),
                    ),
                  );
                  await _loadRewardSummary();
                },
                child: Container(
                  margin: const EdgeInsets.only(top: 2),
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.15),
                        blurRadius: 10,
                        offset: const Offset(0, 5),
                      ),
                    ],
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.star_rounded, size: 22, color: Color(0xFFFFB300)),
                      const SizedBox(width: 10),
                      Text(
                        '${_rewardPointsText()} แต้ม',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 15,
                          color: Color(0xFF3B6FD4),
                          letterSpacing: 0.2,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatsSection() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 14,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _buildClickableStat(userData?['following']?.toString() ?? '0', 'กำลังติดตาม', true),
          _divider(),
          _buildClickableStat(userData?['followers']?.toString() ?? '0', 'ผู้ติดตาม', false),
          _divider(),
          _buildStat(posts.length.toString(), 'โพสต์'),
        ],
      ),
    );
  }

  Widget _buildProfileDetailsSection() {
    if (!_hasProfileDetails()) {
      return const SizedBox.shrink();
    }

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 14,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                      color: Color(0xFF3B6FD4),
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 10),
                  const Text(
                    'ข้อมูลประจำตัว',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF1F2A44),
                    ),
                  ),
                ],
              ),
              if (isMyProfile)
                Container(
                  decoration: BoxDecoration(
                    color: const Color(0xFFF0F4FF),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: IconButton(
                    icon: const Icon(Icons.edit_outlined, color: Color(0xFF3B6FD4), size: 20),
                    onPressed: _showEditProfileDetailsDialog,
                    constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
                    padding: EdgeInsets.zero,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 18),
          if ((profileDetails?['current_location'] ?? '').toString().isNotEmpty)
            ...[
              _buildProfileDetailItem(
                icon: Icons.location_on_outlined,
                label: 'สถานที่อยู่ปัจจุบัน',
                value: profileDetails?['current_location'] ?? '',
              ),
            ],
          if ((profileDetails?['hometown'] ?? '').toString().isNotEmpty)
            ...[
              _buildProfileDetailItem(
                icon: Icons.home_outlined,
                label: 'บ้านเกิด',
                value: profileDetails?['hometown'] ?? '',
              ),
            ],
          if ((profileDetails?['birth_date'] ?? '').toString().isNotEmpty)
            ...[
              _buildProfileDetailItem(
                icon: Icons.cake_outlined,
                label: 'วันเกิด',
                value: _formatBirthDate(profileDetails?['birth_date']?.toString()),
              ),
            ],
          if ((profileDetails?['relationship_status'] ?? '').toString().isNotEmpty)
            ...[
              _buildProfileDetailItem(
                icon: Icons.favorite_outline,
                label: 'สถานะ',
                value: profileDetails?['relationship_status'] ?? '',
              ),
            ],
          if ((profileDetails?['family_info'] ?? '').toString().isNotEmpty)
            ...[
              _buildProfileDetailItem(
                icon: Icons.group_outlined,
                label: 'สมาชิกครอบครัว',
                value: profileDetails?['family_info'] ?? '',
              ),
            ],
          if ((profileDetails?['gender'] ?? '').toString().isNotEmpty)
            ...[
              _buildProfileDetailItem(
                icon: Icons.wc_outlined,
                label: 'เพศ',
                value: profileDetails?['gender'] ?? '',
              ),
            ],
          if ((profileDetails?['pronouns'] ?? '').toString().isNotEmpty)
            ...[
              _buildProfileDetailItem(
                icon: Icons.badge_outlined,
                label: 'สรรพนาม',
                value: profileDetails?['pronouns'] ?? '',
              ),
            ],
        ],
      ),
    );
  }

  Widget _buildAboutSection() {
    final about = (userData?['about_me'] ?? '').toString();
    if (about.isEmpty && !isMyProfile) {
      return const SizedBox.shrink();
    }

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 14,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                      color: Color(0xFF3B6FD4),
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 10),
                  const Text(
                    'ข้อมูลเพิ่มเติม',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF1F2A44),
                    ),
                  ),
                ],
              ),
              if (isMyProfile)
                Container(
                  decoration: BoxDecoration(
                    color: const Color(0xFFF0F4FF),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: IconButton(
                    icon: const Icon(Icons.edit_outlined, size: 20, color: Color(0xFF3B6FD4)),
                    onPressed: _showEditAboutMeDialog,
                    constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
                    padding: EdgeInsets.zero,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 14),
          if (about.isNotEmpty)
            Text(
              about,
              style: const TextStyle(
                fontSize: 15,
                color: Color(0xFF424242),
                height: 1.6,
                fontWeight: FontWeight.w500,
                letterSpacing: 0.2,
              ),
            )
          else
            GestureDetector(
              onTap: _showEditAboutMeDialog,
              child: Text(
                'เพิ่มข้อมูลเพิ่มเติมเกี่ยวกับคุณ',
                style: TextStyle(
                  fontSize: 15,
                  color: Colors.grey.shade400,
                  fontStyle: FontStyle.italic,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildPostsSection() {
    final list = posts
        .where(
          (p) => !isMyProfile || (p['phone_number']?.toString() ?? '') == widget.currentUserPhone,
        )
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              SizedBox(
                width: 8,
                height: 8,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: Color(0xFF3B6FD4),
                    shape: BoxShape.circle,
                  ),
                ),
              ),
              SizedBox(width: 10),
              Text(
                'โพสต์ทั้งหมด',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF1F2A44),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (list.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 32),
                child: Column(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade100,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(Icons.article_outlined, size: 48, color: Colors.grey.shade400),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'ยังไม่มีโพสต์',
                      style: TextStyle(
                        fontSize: 16,
                        color: Colors.grey.shade600,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          )
        else
          Column(children: list.map((p) => _buildPostCard(p as Map)).toList()),
      ],
    );
  }

  Future<void> _changeAvatar() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (picked == null) return;

    final cropped = await _cropCircle(picked.path);
    if (cropped == null) return;

    try {
      final url = await ApiService.uploadProfilePicture(widget.phoneNumber, cropped);
      if (!mounted) return;
      setState(() => avatarUrl = url);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('เปลี่ยนรูปโปรไฟล์สำเร็จ')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('อัปโหลดล้มเหลว: $e')),
      );
    }
  }

  Future<String?> _cropCircle(String path) async {
    final result = await ImageCropper().cropImage(
      sourcePath: path,
      aspectRatio: const CropAspectRatio(ratioX: 1, ratioY: 1),
      uiSettings: [
        AndroidUiSettings(
          toolbarTitle: 'ครอปรูปโปรไฟล์',
          toolbarColor: const Color(0xFF3B6FD4),
          toolbarWidgetColor: Colors.white,
          lockAspectRatio: true,
        ),
        IOSUiSettings(
          title: 'ครอปรูปโปรไฟล์',
          aspectRatioLockEnabled: true,
        ),
      ],
    );
    return result?.path;
  }

  Widget _buildPostCard(Map p) {
    return PostCard(
      post: p,
      currentUserPhone: widget.currentUserPhone,
      onLike: (postId) => likePost(postId, (p['user_like'] != 'like') ? 'like' : 'remove'),
      onComment: openComments,
      onShare: () => _openShareSheet(p),
      onMenu: () {
        if ((p['phone_number']?.toString() ?? '') == widget.currentUserPhone) {
          openPostMenu(p);
        } else {
          openPostMoreMenu(p);
        }
      },
      onAvatarTap: () {
        if ((p['phone_number']?.toString() ?? '') != widget.currentUserPhone) {
          Navigator.pop(context);
        }
      },
      onTtsStart: () {
        final text = (p['content'] ?? '').toString();
        if (text.isEmpty) return;
        final ttsId = 'post_${p['post_id']}';
        _tts.speak(
          text: text,
          id: ttsId,
          onStart: (id) {
            if (!mounted) return;
            setState(() => _speakingId = id);
          },
          onDone: (_) {
            if (!mounted) return;
            setState(() => _speakingId = null);
          },
        );
      },
      onTtsEnd: () {
        _tts.stop();
        if (!mounted) return;
        setState(() => _speakingId = null);
      },
      speakingId: _speakingId,
      isFromProfile: true,
      isBlocked: isBlocked,
      onPostTap: () => Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => PostDetailPage(
            post: p,
            currentUserPhone: widget.currentUserPhone,
            onPostChanged: loadPosts,
          ),
        ),
      ).then((_) => loadPosts()),
    );
  }

  Future<void> likePost(int postId, String type) async {
    await http.post(
      Uri.parse('$baseUrl/posts/$postId/like'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'phone': widget.currentUserPhone, 'type': type}),
    );
    loadPosts();
  }

  void openComments(int postId) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => CommentDialog(
        postId: postId,
        currentUserPhone: widget.currentUserPhone,
        baseUrl: baseUrl,
        userPhoneForCommentCreation: widget.currentUserPhone,
        onCommentAdded: loadPosts,
        enableTTS: true,
        enableSTT: true,
      ),
    );
  }

  Future<void> deletePost(int postId) async {
    try {
      await ApiService.deletePost(postId, widget.currentUserPhone);
      setState(() => posts.removeWhere((p) => p['post_id'] == postId));
      await loadPosts();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('ลบโพสต์สำเร็จ')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('เกิดข้อผิดพลาด: $e')),
      );
    }
  }

  Future<void> reportPost(int postId, {String? reason, String? detail}) async {
    try {
      await http.post(
        Uri.parse('$baseUrl/posts/$postId/report'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'phone': widget.currentUserPhone,
          if (reason != null && reason.isNotEmpty) 'reason': reason,
          if (detail != null && detail.trim().isNotEmpty) 'detail': detail.trim(),
        }),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('รายงานโพสต์แล้ว ขอบคุณที่แจ้ง')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('รายงานไม่สำเร็จ: $e')),
      );
    }
  }

  Future<void> _openReportPostDialog(Map p) async {
    final detailController = TextEditingController();
    String selectedReason = 'สแปมหรือโฆษณา';

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('รายงานโพสต์'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                value: selectedReason,
                items: const [
                  DropdownMenuItem(value: 'สแปมหรือโฆษณา', child: Text('สแปมหรือโฆษณา')),
                  DropdownMenuItem(value: 'เนื้อหาไม่เหมาะสม', child: Text('เนื้อหาไม่เหมาะสม')),
                  DropdownMenuItem(value: 'ข้อมูลเท็จหรือทำให้เข้าใจผิด', child: Text('ข้อมูลเท็จหรือทำให้เข้าใจผิด')),
                  DropdownMenuItem(value: 'คุกคามหรือกลั่นแกล้ง', child: Text('คุกคามหรือกลั่นแกล้ง')),
                  DropdownMenuItem(value: 'อื่นๆ', child: Text('อื่นๆ')),
                ],
                onChanged: (v) {
                  if (v == null) return;
                  setDialogState(() => selectedReason = v);
                },
              ),
              const SizedBox(height: 12),
              TextField(
                controller: detailController,
                maxLines: 4,
                inputFormatters: [LengthLimitingTextInputFormatter(2000)],
                decoration: const InputDecoration(
                  hintText: 'รายละเอียดเพิ่มเติม (ถ้ามี)',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('ยกเลิก')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('ส่งรายงาน')),
          ],
        ),
      ),
    );

    if (ok == true) {
      await reportPost(
        p['post_id'] as int,
        reason: selectedReason,
        detail: detailController.text,
      );
    }
  }

  void _openShareSheet(Map p) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => ShareSheet(
        post: p,
        currentUserPhone: widget.currentUserPhone,
        baseUrl: baseUrl,
        myName: userData?['full_name'],
        myAvatarUrl: avatarUrl,
        onShareInApp: () => _openSharePopup(p),
      ),
    );
  }

  void _openSharePopup(Map originalPost) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => SharePostSheet(
        post: originalPost,
        currentUserPhone: widget.currentUserPhone,
        baseUrl: baseUrl,
        myName: userData?['full_name'],
        myAvatarUrl: avatarUrl,
        onShareComplete: loadProfile,
      ),
    );
  }

  Widget _menuTile({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
    Color? titleColor,
  }) {
    return ActionSheetTile(
      icon: icon,
      iconColor: iconColor,
      title: title,
      subtitle: subtitle,
      titleColor: titleColor,
      onTap: onTap,
    );
  }

  void openPostMenu(Map p) {
    final rootContext = context;
    showModalBottomSheet(
      context: rootContext,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _menuTile(
            icon: Icons.delete_outline,
            iconColor: Colors.red,
            title: 'ลบโพสต์',
            subtitle: 'ลบโพสต์นี้ออกถาวร',
            titleColor: Colors.red,
            onTap: () async {
              Navigator.pop(rootContext);
              final confirm = await showDialog<bool>(
                context: rootContext,
                builder: (_) => AlertDialog(
                  title: const Text('ยืนยันการลบ'),
                  content: const Text('คุณแน่ใจหรือไม่ว่าต้องการลบโพสต์นี้?'),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(rootContext, false),
                      child: const Text('ยกเลิก'),
                    ),
                    FilledButton(
                      onPressed: () => Navigator.pop(rootContext, true),
                      style: FilledButton.styleFrom(backgroundColor: Colors.red),
                      child: const Text('ลบ'),
                    ),
                  ],
                ),
              );
              if (confirm == true) {
                await deletePost(p['post_id'] as int);
              }
            },
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }

  void openPostMoreMenu(Map p) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (sheetContext) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _menuTile(
            icon: Icons.flag_outlined,
            iconColor: Colors.red,
            title: 'รายงานโพสต์',
            subtitle: 'แจ้งว่าโพสต์นี้ละเมิดกฎชุมชน',
            titleColor: Colors.red,
            onTap: () async {
              Navigator.pop(sheetContext);
              await _openReportPostDialog(p);
            },
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }

  Widget _buildStat(String count, String label) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            count,
            style: const TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w900,
              color: Color(0xFF3B6FD4),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            style: const TextStyle(
              color: Color(0xFF757575),
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.2,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      );

  Widget _divider() => Container(
        height: 48,
        width: 1.2,
        color: Colors.grey.shade200,
      );

  Widget _buildClickableStat(String count, String label, bool isFollowingList) {
    return GestureDetector(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => FollowListPage(
            phoneNumber: widget.phoneNumber,
            isFollowing: isFollowingList,
          ),
        ),
      ),
      child: _buildStat(count, label),
    );
  }

  void _openMenu() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetCtx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        minChildSize: 0.3,
        maxChildSize: 0.9,
        builder: (scrollContext, scrollController) => SingleChildScrollView(
          controller: scrollController,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Center(
                child: Container(
                  width: 48,
                  height: 5,
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              _menuTile(
                icon: Icons.workspace_premium_outlined,
                iconColor: const Color(0xFFFFB300),
                title: 'แต้มและประวัติการใช้แต้ม',
                subtitle: 'ดูแต้มและการใช้แต้มของคุณ',
                onTap: () async {
                  Navigator.pop(sheetCtx);
                  await Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => RewardHistoryPage(phoneNumber: widget.phoneNumber),
                    ),
                  );
                  await _loadRewardSummary();
                },
              ),
              _menuTile(
                icon: Icons.school_outlined,
                iconColor: const Color(0xFF4CAF50),
                title: 'ระบบแต้มสะสม',
                subtitle: 'เรียนรู้วิธีการได้แต้ม',
                onTap: () async {
                  Navigator.pop(sheetCtx);
                  await Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => PointsSystemPage(phoneNumber: widget.phoneNumber),
                    ),
                  );
                },
              ),
              _menuTile(
                icon: Icons.edit,
                iconColor: const Color(0xFF3B6FD4),
                title: 'แก้ไขชื่อ',
                subtitle: 'เปลี่ยนชื่อของคุณ',
                onTap: () {
                  try {
                    Navigator.pop(sheetCtx);
                    _showEditNameDialog();
                  } catch (e) {
                    debugPrint('❌ Error in edit name: $e');
                  }
                },
              ),
              _menuTile(
                icon: Icons.person_outline,
                iconColor: const Color(0xFF00BCD4),
                title: 'แก้ไขข้อมูลประจำตัว',
                subtitle: 'อัปเดตข้อมูลของคุณ',
                onTap: () {
                  try {
                    Navigator.pop(sheetCtx);
                    _showEditProfileDetailsDialog();
                  } catch (e) {
                    debugPrint('❌ Error in edit profile: $e');
                  }
                },
              ),
              _menuTile(
                icon: Icons.description_outlined,
                iconColor: const Color(0xFF9C27B0),
                title: 'เพิ่มข้อมูลเพิ่มเติม',
                subtitle: 'บอกเล่าเกี่ยวกับตัวคุณ',
                onTap: () {
                  try {
                    Navigator.pop(sheetCtx);
                    _showEditAboutMeDialog();
                  } catch (e) {
                    debugPrint('❌ Error in edit about me: $e');
                  }
                },
              ),
              _menuTile(
                icon: Icons.camera_alt,
                iconColor: const Color(0xFFE91E63),
                title: 'เปลี่ยนรูปโปรไฟล์',
                subtitle: 'อัปโหลดรูปใหม่',
                onTap: () {
                  try {
                    Navigator.pop(sheetCtx);
                    _changeAvatar();
                  } catch (e) {
                    debugPrint('❌ Error in change avatar: $e');
                  }
                },
              ),
              _menuTile(
                icon: Icons.settings_outlined,
                iconColor: const Color(0xFF616161),
                title: 'ตั้งค่าแอป',
                subtitle: 'จัดการการตั้งค่าของคุณ',
                onTap: () async {
                  Navigator.pop(sheetCtx);
                  await Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => AppSettingsPage(
                        phoneNumber: widget.currentUserPhone,
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  void _showEditNameDialog() {
    final controller = TextEditingController(text: userData?['full_name'] ?? '');
    showDialog(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: const Text('แก้ไขชื่อ'),
        content: TextField(controller: controller),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogCtx), child: const Text('ยกเลิก')),
          FilledButton(
            onPressed: () async {
              await ApiService.updateName(widget.phoneNumber, controller.text.trim());
              if (!mounted) return;
              Navigator.pop(dialogCtx);
              await loadProfile();
            },
            child: const Text('บันทึก'),
          ),
        ],
      ),
    );
  }

  void _showEditAboutMeDialog() {
    final controller = TextEditingController(text: userData?['about_me'] ?? '');
    showDialog(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        title: const Text('เพิ่มข้อมูลเพิ่มเติม'),
        content: TextField(
          controller: controller,
          maxLines: 4,
          minLines: 2,
          decoration: InputDecoration(
            hintText: 'เขียนเกี่ยวกับตัวคุณ...',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogCtx), child: const Text('ยกเลิก')),
          FilledButton(
            onPressed: () async {
              try {
                await ApiService.updateAboutMe(widget.phoneNumber, controller.text.trim());
                if (!mounted) return;
                Navigator.pop(dialogCtx);
                await loadProfile();
                if (!mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('อัปเดตข้อมูลเพิ่มเติมสำเร็จ')),
                );
              } catch (e) {
                if (!mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('เกิดข้อผิดพลาด: $e')),
                );
              }
            },
            child: const Text('บันทึก'),
          ),
        ],
      ),
    );
  }

  Widget _buildProfileDetailItem({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFF5F8FE),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: const Color(0xFF3B6FD4).withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 18, color: const Color(0xFF3B6FD4)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 11,
                    color: Color(0xFF757575),
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.4,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 15,
                    color: Color(0xFF212121),
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatBirthDate(String? date) {
    if (date == null || date.isEmpty) return '';
    try {
      final dt = DateTime.parse(date);
      return '${dt.day.toString().padLeft(2, '0')}-${dt.month.toString().padLeft(2, '0')}-${dt.year}';
    } catch (_) {
      return date;
    }
  }

  bool _hasProfileDetails() {
    if (profileDetails == null) return false;
    final keys = [
      'current_location',
      'hometown',
      'birth_date',
      'relationship_status',
      'family_info',
      'gender',
      'pronouns',
    ];
    for (final k in keys) {
      if ((profileDetails?[k] ?? '').toString().trim().isNotEmpty) {
        return true;
      }
    }
    return false;
  }

  void _showEditProfileDetailsDialog() {
    final currentLocationCtrl = TextEditingController(text: profileDetails?['current_location'] ?? '');
    final hometownCtrl = TextEditingController(text: profileDetails?['hometown'] ?? '');
    final birthDateCtrl = TextEditingController(text: profileDetails?['birth_date'] ?? '');
    final statusCtrl = TextEditingController(text: profileDetails?['relationship_status'] ?? '');
    final familyCtrl = TextEditingController(text: profileDetails?['family_info'] ?? '');
    final genderCtrl = TextEditingController(text: profileDetails?['gender'] ?? '');
    final pronounsCtrl = TextEditingController(text: profileDetails?['pronouns'] ?? '');

    final statusOptions = ['โสด', 'มีคู่แล้ว', 'แต่งงานแล้ว', 'หย่าร้าง', 'หม้าย', 'ไม่ระบุ'];
    final genderOptions = ['ชาย', 'หญิง', 'ไม่ระบุ', 'อื่นๆ'];
    final pronounOptions = ['เขา', 'เธอ', 'พวกเขา', 'ไม่ระบุ'];

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(sheetContext).viewInsets.bottom),
          child: _EditProfileDetailsSheet(
            currentLocationCtrl: currentLocationCtrl,
            hometownCtrl: hometownCtrl,
            birthDateCtrl: birthDateCtrl,
            statusCtrl: statusCtrl,
            familyCtrl: familyCtrl,
            genderCtrl: genderCtrl,
            pronounsCtrl: pronounsCtrl,
            statusOptions: statusOptions,
            genderOptions: genderOptions,
            pronounOptions: pronounOptions,
            onSelectChoice: (label, currentValue, options, onSelected) async {
              await _showChoicePicker(
                context: sheetContext,
                label: label,
                currentValue: currentValue,
                options: options,
                onSelected: onSelected,
              );
            },
            onSave: () async {
              final birthDateRaw = birthDateCtrl.text.trim();
              if (birthDateRaw.isNotEmpty &&
                  !RegExp(r'^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$')
                      .hasMatch(birthDateRaw)) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('รูปแบบวันเกิดไม่ถูกต้อง กรอกเป็น YYYY-MM-DD เช่น 1970-06-15')),
                );
                return;
              }
              final locationRaw = currentLocationCtrl.text.trim();
              final hometownRaw = hometownCtrl.text.trim();
              final familyRaw = familyCtrl.text.trim();
              if (locationRaw.length > 100 || hometownRaw.length > 100 || familyRaw.length > 200) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('ข้อมูลบางช่องยาวเกินไป (สถานที่สูงสุด 100, สมาชิกครอบครัวสูงสุด 200 ตัวอักษร)')),
                );
                return;
              }
              try {
                await ApiService.updateProfileDetails(
                  widget.phoneNumber,
                  {
                    'current_location': locationRaw.isEmpty ? null : locationRaw,
                    'hometown': hometownRaw.isEmpty ? null : hometownRaw,
                    'birth_date': birthDateRaw.isEmpty ? null : birthDateRaw,
                    'relationship_status': statusCtrl.text.trim().isEmpty ? null : statusCtrl.text.trim(),
                    'family_info': familyRaw.isEmpty ? null : familyRaw,
                    'gender': genderCtrl.text.trim().isEmpty ? null : genderCtrl.text.trim(),
                    'pronouns': pronounsCtrl.text.trim().isEmpty ? null : pronounsCtrl.text.trim(),
                  },
                );
                if (!mounted) return;
                Navigator.pop(sheetContext);
                await loadProfile();
                if (!mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('อัปเดตข้อมูลประจำตัวสำเร็จ')),
                );
              } catch (e) {
                if (!mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('เกิดข้อผิดพลาด: $e')),
                );
              }
            },
          ),
        );
      },
    );
  }

  Future<void> _showChoicePicker({
    required BuildContext context,
    required String label,
    required String currentValue,
    required List<String> options,
    required ValueChanged<String> onSelected,
  }) async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (sheetContext) {
        final sheetHeight = MediaQuery.of(sheetContext).size.height * 0.72;

        return SafeArea(
          child: SizedBox(
            height: sheetHeight,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'เลือกหนึ่งรายการเพื่อบันทึกลงโปรไฟล์',
                    style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
                  ),
                  const SizedBox(height: 16),
                  Expanded(
                    child: ListView.separated(
                      itemCount: options.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        final option = options[index];
                        final isSelected = option == currentValue;
                        return InkWell(
                          borderRadius: BorderRadius.circular(18),
                          onTap: () {
                            onSelected(option);
                            Navigator.pop(sheetContext);
                          },
                          child: Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: isSelected ? const Color(0xFFEAF1FF) : const Color(0xFFF8FAFE),
                              borderRadius: BorderRadius.circular(18),
                              border: Border.all(
                                color: isSelected ? const Color(0xFF3B6FD4) : const Color(0xFFE1E7F0),
                              ),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  width: 38,
                                  height: 38,
                                  decoration: BoxDecoration(
                                    color: isSelected ? const Color(0xFF3B6FD4) : Colors.white,
                                    shape: BoxShape.circle,
                                  ),
                                  child: Icon(
                                    isSelected ? Icons.check : Icons.circle_outlined,
                                    size: 20,
                                    color: isSelected ? Colors.white : Colors.grey.shade500,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    option,
                                    style: TextStyle(
                                      fontSize: 15,
                                      fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                                    ),
                                  ),
                                ),
                                if (isSelected)
                                  const Icon(Icons.verified_rounded, color: Color(0xFF3B6FD4)),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _EditProfileDetailsSheet extends StatelessWidget {
  final TextEditingController currentLocationCtrl;
  final TextEditingController hometownCtrl;
  final TextEditingController birthDateCtrl;
  final TextEditingController statusCtrl;
  final TextEditingController familyCtrl;
  final TextEditingController genderCtrl;
  final TextEditingController pronounsCtrl;
  final List<String> statusOptions;
  final List<String> genderOptions;
  final List<String> pronounOptions;
  final Future<void> Function() onSave;
  final Future<void> Function(
    String label,
    String currentValue,
    List<String> options,
    ValueChanged<String> onSelected,
  ) onSelectChoice;

  const _EditProfileDetailsSheet({
    required this.currentLocationCtrl,
    required this.hometownCtrl,
    required this.birthDateCtrl,
    required this.statusCtrl,
    required this.familyCtrl,
    required this.genderCtrl,
    required this.pronounsCtrl,
    required this.statusOptions,
    required this.genderOptions,
    required this.pronounOptions,
    required this.onSave,
    required this.onSelectChoice,
  });

  Widget _buildSectionLabel(String text) {
    return Row(
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: const BoxDecoration(
            color: Color(0xFF3B6FD4),
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 8),
        Text(
          text,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w800,
            color: Color(0xFF1F2A44),
          ),
        ),
      ],
    );
  }

  Widget _buildEditField(
    String label,
    TextEditingController controller,
    String hint, {
    IconData? icon,
    bool isDate = false,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFF9FBFF),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE3E9F5)),
      ),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (icon != null) ...[
                Icon(icon, size: 18, color: const Color(0xFF3B6FD4)),
                const SizedBox(width: 8),
              ],
              Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            controller: controller,
            keyboardType: isDate ? TextInputType.datetime : TextInputType.text,
            inputFormatters: isDate
                ? [FilteringTextInputFormatter.allow(RegExp(r'[0-9\-]'))]
                : null,
            decoration: InputDecoration(
              hintText: hint,
              filled: true,
              fillColor: Colors.white,
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Color(0xFFD8E0EE)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Color(0xFFD8E0EE)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: Color(0xFF3B6FD4), width: 1.5),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildChoiceField({
    required BuildContext context,
    required String label,
    required TextEditingController controller,
    required IconData icon,
    required String hint,
    required List<String> options,
    required ValueChanged<String> onSelected,
  }) {
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: () async {
        await onSelectChoice(label, controller.text, options, onSelected);
      },
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFFF9FBFF),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFFE3E9F5)),
        ),
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 18, color: const Color(0xFF3B6FD4)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
                const Icon(Icons.expand_more_rounded, color: Colors.black45),
              ],
            ),
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: const Color(0xFFD8E0EE)),
              ),
              child: ValueListenableBuilder<TextEditingValue>(
                valueListenable: controller,
                builder: (_, textValue, _) {
                  final selectedValue = textValue.text.trim();
                  final hasValue = selectedValue.isNotEmpty;
                  return Text(
                    hasValue ? selectedValue : hint,
                    style: TextStyle(
                      color: hasValue ? Colors.black87 : Colors.grey.shade500,
                      fontWeight: hasValue ? FontWeight.w600 : FontWeight.w400,
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: SafeArea(
        top: false,
        child: DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.92,
          minChildSize: 0.5,
          maxChildSize: 0.95,
          builder: (sheetContext, scrollController) {
            return SingleChildScrollView(
              controller: scrollController,
              padding: const EdgeInsets.fromLTRB(18, 10, 18, 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 48,
                      height: 5,
                      decoration: BoxDecoration(
                        color: Colors.grey.shade300,
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFFEEF4FF), Color(0xFFF7F2FF)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(22),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: const BoxDecoration(
                            color: Color(0xFF3B6FD4),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.badge_outlined, color: Colors.white),
                        ),
                        const SizedBox(width: 12),
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'แก้ไขข้อมูลประจำตัว',
                                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                              ),
                              SizedBox(height: 4),
                              Text(
                                'เลือกค่าที่ต้องการ แล้วบันทึกได้ทันที',
                                style: TextStyle(fontSize: 13, color: Colors.black54),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  _buildSectionLabel('ข้อมูลสถานที่'),
                  const SizedBox(height: 10),
                  _buildEditField(
                    'สถานที่อยู่ปัจจุบัน',
                    currentLocationCtrl,
                    'เช่น Pattani, Thailand',
                    icon: Icons.location_on_outlined,
                  ),
                  const SizedBox(height: 12),
                  _buildEditField(
                    'บ้านเกิด',
                    hometownCtrl,
                    'เช่น Pattani, Thailand',
                    icon: Icons.home_outlined,
                  ),
                  const SizedBox(height: 16),
                  _buildSectionLabel('ข้อมูลส่วนตัว'),
                  const SizedBox(height: 10),
                  _buildEditField(
                    'วันเกิด',
                    birthDateCtrl,
                    'YYYY-MM-DD เช่น 2004-06-26',
                    icon: Icons.cake_outlined,
                    isDate: true,
                  ),
                  const SizedBox(height: 12),
                  _buildChoiceField(
                    context: sheetContext,
                    label: 'สถานะ',
                    controller: statusCtrl,
                    icon: Icons.favorite_outline,
                    hint: 'แตะเพื่อเลือกสถานะ',
                    options: statusOptions,
                    onSelected: (value) => statusCtrl.text = value,
                  ),
                  const SizedBox(height: 12),
                  _buildEditField(
                    'สมาชิกครอบครัว',
                    familyCtrl,
                    'เช่น พ่อ แม่ น้อง',
                    icon: Icons.group_outlined,
                  ),
                  const SizedBox(height: 12),
                  _buildChoiceField(
                    context: sheetContext,
                    label: 'เพศ',
                    controller: genderCtrl,
                    icon: Icons.wc_outlined,
                    hint: 'แตะเพื่อเลือกเพศ',
                    options: genderOptions,
                    onSelected: (value) => genderCtrl.text = value,
                  ),
                  const SizedBox(height: 12),
                  _buildChoiceField(
                    context: sheetContext,
                    label: 'สรรพนาม',
                    controller: pronounsCtrl,
                    icon: Icons.badge_outlined,
                    hint: 'แตะเพื่อเลือกสรรพนาม',
                    options: pronounOptions,
                    onSelected: (value) => pronounsCtrl.text = value,
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: onSave,
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        backgroundColor: const Color(0xFF3B6FD4),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                      child: const Text('บันทึกข้อมูล'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Center(
                    child: TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('ยกเลิก'),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}


