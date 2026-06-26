import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:image_cropper/image_cropper.dart';
import 'services/api_service.dart';
import 'services/ad_service.dart';
import 'services/tts_stt_service.dart';
import 'profile_page.dart';
import 'partner_page.dart';
import 'post_detail_page.dart';
import 'widgets/comment_dialog.dart';
import 'widgets/post_component.dart';
import 'widgets/share_sheet.dart';
import 'widgets/action_sheet_tile.dart';

class CommunityPage extends StatefulWidget {
  final String phoneNumber;

  final int? groupId;
  final String? groupName;

  const CommunityPage({
    super.key,
    required this.phoneNumber,
    this.groupId,
    this.groupName,
  });

  @override
  State<CommunityPage> createState() => _CommunityPageState();
}

class _CommunityPageState extends State<CommunityPage> {
  static const int _maxPostLength = 5000;
  static const int _maxPostImages = 10;

  final String baseUrl = ApiService.baseUrl;

  List posts = [];
  bool loading = true;

  final TextEditingController postController = TextEditingController();

  List<File> selectedImages = [];
  String _selectedVisibility = 'public';
  int? _selectedGroupId; // กลุ่มที่เลือกสำหรับโพสต์

  String? _myName;
  String? _myAvatarUrl;
  bool _isBlocked = false;
  String _blockedReason = '';
  String _warningNote = '';

  bool _isGroupMember = false;
  bool _groupStatusLoading = false;
  String? _groupNameOverride;
  bool _loadError = false;

  bool get _isGroupMode => widget.groupId != null;
  int? get _activeGroupId => widget.groupId;

  String get _groupTitle => widget.groupName ?? _groupNameOverride ?? 'กลุ่ม';

  // ── กลุ่มแนะนำ ──
  static const List<Map<String, dynamic>> _recommendedGroups = [
    {
      'group_id': 1,
      'name': 'กลุ่มรักษ์สุขภาพ',
      'desc': 'สุขภาพดี ชีวีมีสุข',
      'icon': 0xe87d,
      'color': 0xFF4CAF50,
    }, // favorite
    {
      'group_id': 2,
      'name': 'กลุ่มงานอดิเรก',
      'desc': 'โชว์ฝีมือ แบ่งปันงาน',
      'icon': 0xe3ae,
      'color': 0xFFFF9800,
    }, // brush
    {
      'group_id': 3,
      'name': 'กลุ่มธรรมะและปัญญา',
      'desc': 'ข้อคิดดี ๆ คำคมใจ',
      'icon': 0xe571,
      'color': 0xFF9C27B0,
    }, // self_improvement
    {
      'group_id': 4,
      'name': 'กลุ่มเทคโนโลยีเบื้องต้น',
      'desc': 'เทคนิคมือถือ แอปต่าง ๆ',
      'icon': 0xe1b1,
      'color': 0xFF2196F3,
    }, // devices
    {
      'group_id': 5,
      'name': 'กลุ่มพาเที่ยว พากิน',
      'desc': 'แนะนำที่เที่ยว ร้านเด็ด',
      'icon': 0xe87a,
      'color': 0xFFF44336,
    }, // explore
  ];

  List<Map<String, dynamic>> _articleAds = [];

  // ── TTS / STT state ──
  final _tts = TtsSttService.instance;
  String? _speakingId; // id ของโพสต์/คอมเมนต์ที่กำลังอ่าน
  bool _isListening = false; // กำลังฟังเสียงอยู่ไหม (STT)

  @override
  void initState() {
    super.initState();
    if (_isGroupMode) {
      _selectedGroupId = _activeGroupId;
      _loadGroupStatus();
    }
    loadPosts();
    _loadMyProfile();
    _loadModerationStatus();
    _loadArticleAds();
  }

  @override
  void dispose() {
    _tts.stop();
    _tts.stopListening();
    postController.dispose();
    super.dispose();
  }

  String _serverBaseUrl() {
    final apiUri = Uri.parse(ApiService.baseUrl);
    final authority = apiUri.hasPort
        ? '${apiUri.host}:${apiUri.port}'
        : apiUri.host;
    return '${apiUri.scheme}://$authority';
  }

  String? _normalizeUploadUrl(String? raw) {
    if (raw == null || raw.trim().isEmpty) return null;
    final value = raw.trim();
    final serverBase = _serverBaseUrl();

    if (value.startsWith('http://10.0.2.2:3000')) {
      return value.replaceFirst('http://10.0.2.2:3000', serverBase);
    }
    if (value.startsWith('/uploads/')) {
      return '$serverBase$value';
    }
    if (value.startsWith('uploads/')) {
      return '$serverBase/$value';
    }
    if (value.startsWith('avatars/')) {
      return '$serverBase/uploads/$value';
    }
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
    return '$serverBase/uploads/$value';
  }

  Future<void> _loadMyProfile() async {
    try {
      final name = await ApiService.getUserName(widget.phoneNumber);
      final pictureUrl = await ApiService.getProfilePictureUrl(
        widget.phoneNumber,
      );
      final profile = await ApiService.getUserProfile(widget.phoneNumber);
      final fallbackFromProfile =
          profile['profile_picture_url']?.toString() ??
          profile['profile_picture']?.toString();
      final normalizedUrl =
          _normalizeUploadUrl(pictureUrl) ??
          _normalizeUploadUrl(fallbackFromProfile);
      if (mounted)
        setState(() {
          _myName = name;
          _myAvatarUrl = normalizedUrl;
        });
    } catch (_) {}
  }

  // ================= FORMAT TIME AGO =================

  String formatTimeAgo(String? createdAt) {
    if (createdAt == null) return '';
    try {
      final raw = createdAt;
      final utcStr = raw.endsWith('Z') || raw.contains('+') ? raw : '${raw}Z';
      final postTime = DateTime.parse(utcStr);
      final now = DateTime.now().toUtc();
      final difference = now.difference(postTime);
      if (difference.inDays > 0) {
        return '${difference.inDays} วันที่แล้ว';
      }
      if (difference.inHours > 0) {
        return '${difference.inHours} ชั่วโมงที่แล้ว';
      }
      if (difference.inMinutes > 0) {
        return '${difference.inMinutes} นาทีที่แล้ว';
      }
      return 'เมื่อสักครู่';
    } catch (e) {
      return '';
    }
  }

  int _toInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }

  // ================= ADS =================

  Future<void> _loadArticleAds() async {
    final ads = await AdService.getArticleAds();
    if (!mounted) return;
    setState(() => _articleAds = ads);
  }

  List<Widget> _buildFeedWithAds() {
    const adInterval = 5;
    final result = <Widget>[];
    int adIndex = 0;
    for (int i = 0; i < posts.length; i++) {
      result.add(_buildPostCard(posts[i] as Map));
      if ((i + 1) % adInterval == 0 && adIndex < _articleAds.length) {
        result.add(_buildSponsoredArticleCard(_articleAds[adIndex]));
        adIndex++;
      }
    }
    return result;
  }

  Widget _buildSponsoredArticleCard(Map<String, dynamic> ad) {
    final adId       = int.tryParse(ad['id']?.toString() ?? '') ?? 0;
    final title      = ad['title']?.toString() ?? '';
    final body       = ad['body']?.toString() ?? '';
    final ctaText    = ad['cta_text']?.toString() ?? 'ดูเพิ่มเติม';
    final imageUrl   = AdService.resolveImageUrl(ad['image_url']?.toString());
    final logoUrl    = AdService.resolveImageUrl(ad['partner_logo']?.toString());
    final partnerName = ad['partner_name']?.toString() ?? '';
    final partnerId  = ad['partner_id'] != null
        ? int.tryParse(ad['partner_id'].toString())
        : null;

    AdService.trackView(adId);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF6C47D4).withValues(alpha: 0.2)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Sponsored header
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
            child: Row(
              children: [
                if (logoUrl.isNotEmpty)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: Image.network(
                      logoUrl,
                      width: 22,
                      height: 22,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                    ),
                  ),
                if (logoUrl.isNotEmpty) const SizedBox(width: 6),
                if (partnerName.isNotEmpty)
                  Text(
                    partnerName,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Colors.grey.shade700,
                    ),
                  ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFF6C47D4),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text(
                    'สนับสนุน',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
          // Image
          if (imageUrl.isNotEmpty) ...[
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: const BorderRadius.vertical(),
              child: Image.network(
                imageUrl,
                width: double.infinity,
                height: 160,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const SizedBox.shrink(),
              ),
            ),
          ],
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (body.isNotEmpty) ...[
                  const SizedBox(height: 5),
                  Text(
                    body,
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.grey.shade700,
                      height: 1.4,
                    ),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
                const SizedBox(height: 10),
                GestureDetector(
                  onTap: () {
                    AdService.trackClick(adId);
                    if (partnerId != null) {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => PartnerPage(partnerId: partnerId),
                        ),
                      );
                    }
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: const Color(0xFF6C47D4).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                          color: const Color(0xFF6C47D4).withValues(alpha: 0.4)),
                    ),
                    child: Text(
                      ctaText,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF6C47D4),
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

  // ================= LOAD POSTS =================

  Future<void> _loadModerationStatus() async {
    try {
      final status = await ApiService.getModerationStatus(widget.phoneNumber);
      if (!mounted) return;

      setState(() {
        _isBlocked = status["is_blocked"] == true;
        _blockedReason = (status["blocked_reason"] ?? "").toString();
        _warningNote = (status["warning_note"] ?? "").toString();
      });
    } catch (_) {}
  }

  void _showBlockedInteractionMessage() {
    final message = _warningNote.isNotEmpty
        ? _warningNote
        : (_blockedReason.isNotEmpty
              ? _blockedReason
              : "บัญชีนี้ถูกจำกัดการมีส่วนร่วมชั่วคราว");
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _loadGroupStatus() async {
    if (!_isGroupMode || _activeGroupId == null) return;

    setState(() => _groupStatusLoading = true);
    final status = await ApiService.getGroupStatus(
      _activeGroupId!,
      widget.phoneNumber,
    );

    if (!mounted) return;
    setState(() {
      _isGroupMember = status['is_member'] == true;
      final groupName = (status['group_name'] ?? '').toString();
      _groupNameOverride = groupName.isNotEmpty
          ? groupName
          : _groupNameOverride;
      _groupStatusLoading = false;
    });
  }

  Future<void> _joinCurrentGroup() async {
    if (_activeGroupId == null) return;
    final ok = await ApiService.joinGroup(_activeGroupId!, widget.phoneNumber);
    if (!mounted) return;

    if (ok) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('เข้าร่วมกลุ่มแล้ว')));
      await _loadGroupStatus();
      await loadPosts();
      return;
    }

    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('เข้าร่วมกลุ่มไม่สำเร็จ')));
  }

  Future loadPosts() async {
    if (mounted) setState(() => _loadError = false);
    try {
      await _loadModerationStatus();

      if (_isGroupMode && _activeGroupId != null) {
        final data = await ApiService.getGroupPosts(
          _activeGroupId!,
          widget.phoneNumber,
        );
        if (!mounted) return;
        setState(() {
          posts = data;
          loading = false;
        });
        return;
      }

      final res = await http.get(
        Uri.parse("$baseUrl/posts?phone=${widget.phoneNumber}"),
      ).timeout(const Duration(seconds: 20));
      if (res.statusCode != 200) {
        setState(() => loading = false);
        return;
      }
      final data = jsonDecode(res.body) ?? [];
      setState(() {
        posts = data is List ? data : [];
        loading = false;
      });
    } catch (e) {
      setState(() {
        posts = [];
        loading = false;
        _loadError = true;
      });
    }
  }

  // ================= PICK + CROP IMAGES =================

  Future<void> pickImages() async {
    final picker = ImagePicker();
    final imgs = await picker.pickMultiImage(imageQuality: 85);
    if (imgs.isEmpty) return;

    List<File> cropped = [];
    for (final img in imgs) {
      final result = await ImageCropper().cropImage(
        sourcePath: img.path,
        uiSettings: [
          AndroidUiSettings(
            toolbarTitle: 'ครอปรูปภาพ',
            toolbarColor: const Color(0xFF3B6FD4),
            toolbarWidgetColor: Colors.white,
            initAspectRatio: CropAspectRatioPreset.original,
            lockAspectRatio: false,
          ),
          IOSUiSettings(
            title: 'ครอปรูปภาพ',
            aspectRatioLockEnabled: false,
            resetAspectRatioEnabled: true,
          ),
        ],
      );
      if (result != null) cropped.add(File(result.path));
    }

    if (cropped.isNotEmpty) {
      if (cropped.length > _maxPostImages) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('แนบรูปได้สูงสุด $_maxPostImages รูปต่อโพสต์'),
            ),
          );
        }
        cropped = cropped.take(_maxPostImages).toList();
      }
      setState(() => selectedImages = cropped);
    }
  }

  // ================= CREATE POST =================

  Future<bool> createPost() async {
    final content = postController.text.trim();
    if (content.isEmpty && selectedImages.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('กรุณาพิมพ์ข้อความหรือแนบรูปอย่างน้อย 1 รายการ')),
        );
      }
      return false;
    }

    if (content.length > _maxPostLength) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('ข้อความต้องไม่เกิน $_maxPostLength ตัวอักษร')),
        );
      }
      return false;
    }

    if (selectedImages.length > _maxPostImages) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('แนบรูปได้สูงสุด $_maxPostImages รูปต่อโพสต์')),
        );
      }
      return false;
    }

    if (_isGroupMode && !_isGroupMember) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('ต้องเข้าร่วมกลุ่มก่อน จึงจะโพสต์ได้')),
        );
      }
      return false;
    }

    var request = http.MultipartRequest("POST", Uri.parse("$baseUrl/posts"));
    request.fields["phone"] = widget.phoneNumber;
    request.fields["content"] = content;
    request.fields["visibility"] = _selectedVisibility;

    final postGroupId = _isGroupMode ? _activeGroupId : _selectedGroupId;
    if (postGroupId != null) {
      request.fields["group_id"] = postGroupId.toString();
    }

    for (var img in selectedImages) {
      request.files.add(await http.MultipartFile.fromPath("images", img.path));
    }

    final response = await request.send();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final responseBody = await response.stream.bytesToString();
      String message = 'ไม่สามารถโพสต์ได้ กรุณาลองใหม่';
      try {
        final data = jsonDecode(responseBody);
        final error = data is Map ? data['error']?.toString() : null;
        if (error != null && error.trim().isNotEmpty) {
          message = error;
        }
      } catch (_) {}

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(message)),
        );
      }
      return false;
    }

    postController.clear();
    setState(() {
      selectedImages.clear();
      _selectedVisibility = 'public';
      _selectedGroupId = _isGroupMode ? _activeGroupId : null;
    });
    await loadPosts();
    return true;
  }

  // ================= NAVIGATE TO PROFILE =================

  void _goToProfile(String targetPhone) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ProfilePage(
          phoneNumber: targetPhone,
          currentUserPhone: widget.phoneNumber,
        ),
      ),
    ).then((_) => loadPosts());
  }

  // ================= OPEN CREATE POST POPUP =================

  void openCreatePostPopup() {
    _loadMyProfile();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return StatefulBuilder(
          builder: (ctx, setModal) {
            // ความสูงสูงสุด = 90% ของหน้าจอ
            final maxHeight = MediaQuery.of(context).size.height * 0.90;
            final bottomInset = MediaQuery.of(context).viewInsets.bottom;

            return AnimatedPadding(
              duration: const Duration(milliseconds: 150),
              padding: EdgeInsets.only(bottom: bottomInset),
              child: ConstrainedBox(
                constraints: BoxConstraints(maxHeight: maxHeight),
                child: Container(
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.vertical(
                      top: Radius.circular(16),
                    ),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // ── Handle bar ──
                      Container(
                        margin: const EdgeInsets.only(top: 10, bottom: 4),
                        width: 36,
                        height: 4,
                        decoration: BoxDecoration(
                          color: Colors.grey.shade300,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),

                      // ── Header (fixed) ──
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 10,
                        ),
                        child: Row(
                          children: [
                            const Expanded(
                              child: Text(
                                "สร้างโพสต์",
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 17,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            GestureDetector(
                              onTap: () => Navigator.pop(context),
                              child: Container(
                                width: 30,
                                height: 30,
                                decoration: BoxDecoration(
                                  color: Colors.grey.shade200,
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(
                                  Icons.close,
                                  size: 18,
                                  color: Colors.black87,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),

                      const Divider(height: 1),

                      // ── Scrollable middle section ──
                      Flexible(
                        child: SingleChildScrollView(
                          keyboardDismissBehavior:
                              ScrollViewKeyboardDismissBehavior.onDrag,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // ── Author row ──
                              Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 12,
                                ),
                                child: Row(
                                  children: [
                                    CircleAvatar(
                                      radius: 22,
                                      backgroundColor: const Color(0xFF1877F2),
                                      backgroundImage: _myAvatarUrl != null
                                          ? NetworkImage(_myAvatarUrl!)
                                          : null,
                                      child: _myAvatarUrl == null
                                          ? Text(
                                              (_myName ?? widget.phoneNumber)
                                                      .isNotEmpty
                                                  ? (_myName ??
                                                            widget
                                                                .phoneNumber)[0]
                                                        .toUpperCase()
                                                  : "?",
                                              style: const TextStyle(
                                                color: Colors.white,
                                                fontWeight: FontWeight.bold,
                                              ),
                                            )
                                          : null,
                                    ),
                                    const SizedBox(width: 10),
                                    Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          _myName ?? widget.phoneNumber,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.bold,
                                            fontSize: 15,
                                          ),
                                        ),
                                        // ── Visibility badge (tappable) ──
                                        GestureDetector(
                                          onTap: () =>
                                              _showVisibilityPicker(setModal),
                                          child: Container(
                                            margin: const EdgeInsets.only(
                                              top: 3,
                                            ),
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 8,
                                              vertical: 3,
                                            ),
                                            decoration: BoxDecoration(
                                              color: const Color(
                                                0xFF1877F2,
                                              ).withValues(alpha: 0.1),
                                              borderRadius:
                                                  BorderRadius.circular(6),
                                              border: Border.all(
                                                color: const Color(
                                                  0xFF1877F2,
                                                ).withValues(alpha: 0.3),
                                              ),
                                            ),
                                            child: Row(
                                              children: [
                                                Icon(
                                                  _visibilityIcon(
                                                    _selectedVisibility,
                                                  ),
                                                  size: 13,
                                                  color: const Color(
                                                    0xFF1877F2,
                                                  ),
                                                ),
                                                const SizedBox(width: 4),
                                                Text(
                                                  _visibilityLabel(
                                                    _selectedVisibility,
                                                  ),
                                                  style: const TextStyle(
                                                    fontSize: 12,
                                                    color: Color(0xFF1877F2),
                                                    fontWeight: FontWeight.w600,
                                                  ),
                                                ),
                                                const SizedBox(width: 3),
                                                const Icon(
                                                  Icons.keyboard_arrow_down,
                                                  size: 14,
                                                  color: Color(0xFF1877F2),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),

                              // ── TextField ขยายได้ไม่จำกัด ──
                              Padding(
                                padding: const EdgeInsets.only(
                                  left: 16,
                                  right: 16,
                                  bottom: 4,
                                ),
                                child: GestureDetector(
                                  onTap: () => _showGroupPicker(setModal),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 10,
                                      vertical: 6,
                                    ),
                                    decoration: BoxDecoration(
                                      color: _selectedGroupId != null
                                          ? const Color(
                                              0xFF3B6FD4,
                                            ).withValues(alpha: 0.08)
                                          : Colors.grey.shade100,
                                      borderRadius: BorderRadius.circular(8),
                                      border: Border.all(
                                        color: _selectedGroupId != null
                                            ? const Color(
                                                0xFF3B6FD4,
                                              ).withValues(alpha: 0.4)
                                            : Colors.grey.shade300,
                                      ),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Icon(
                                          Icons.group,
                                          size: 14,
                                          color: _selectedGroupId != null
                                              ? const Color(0xFF3B6FD4)
                                              : Colors.grey.shade600,
                                        ),
                                        const SizedBox(width: 6),
                                        Text(
                                          _selectedGroupId != null
                                              ? _recommendedGroups.firstWhere(
                                                      (g) =>
                                                          g['group_id'] ==
                                                          _selectedGroupId,
                                                      orElse: () => {
                                                        'name': 'กลุ่ม',
                                                      },
                                                    )['name']
                                                    as String
                                              : 'โพสต์ในกลุ่ม (ไม่บังคับ)',
                                          style: TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w500,
                                            color: _selectedGroupId != null
                                                ? const Color(0xFF3B6FD4)
                                                : Colors.grey.shade600,
                                          ),
                                        ),
                                        const SizedBox(width: 4),
                                        Icon(
                                          Icons.keyboard_arrow_down,
                                          size: 14,
                                          color: _selectedGroupId != null
                                              ? const Color(0xFF3B6FD4)
                                              : Colors.grey.shade600,
                                        ),
                                        if (_selectedGroupId != null) ...[
                                          const SizedBox(width: 4),
                                          GestureDetector(
                                            onTap: () => setModal(
                                              () => setState(
                                                () => _selectedGroupId = null,
                                              ),
                                            ),
                                            child: Icon(
                                              Icons.close,
                                              size: 13,
                                              color: Colors.grey.shade600,
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),
                                ),
                              ),

                              // ── TextField ──
                              Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                ),
                                child: TextField(
                                  controller: postController,
                                  maxLines:
                                      null, // ไม่จำกัดบรรทัด — ขยายอัตโนมัติ
                                  minLines: 4,
                                  keyboardType: TextInputType.multiline,
                                  textInputAction: TextInputAction.newline,
                                  enableInteractiveSelection: true,
                                  enableSuggestions: true,
                                  enableIMEPersonalizedLearning: true,
                                  obscureText: false,
                                  autocorrect: false,
                                  inputFormatters: [
                                    LengthLimitingTextInputFormatter(5000),
                                  ],
                                  style: const TextStyle(fontSize: 17),
                                  decoration: const InputDecoration(
                                    hintText: "คุณกำลังคิดอะไรอยู่?",
                                    hintStyle: TextStyle(
                                      fontSize: 17,
                                      color: Colors.black38,
                                    ),
                                    border: InputBorder.none,
                                    contentPadding: EdgeInsets.zero,
                                  ),
                                ),
                              ),

                              // ── Character counter ──
                              ValueListenableBuilder<TextEditingValue>(
                                valueListenable: postController,
                                builder: (_, value, __) {
                                  final count = value.text.length;
                                  if (count == 0) return const SizedBox.shrink();
                                  final near = count >= 4500;
                                  return Padding(
                                    padding: const EdgeInsets.only(right: 16, top: 4),
                                    child: Align(
                                      alignment: Alignment.centerRight,
                                      child: Text(
                                        '$count / $_maxPostLength',
                                        style: TextStyle(
                                          fontSize: 12,
                                          color: near ? Colors.red : Colors.grey,
                                        ),
                                      ),
                                    ),
                                  );
                                },
                              ),

                              const SizedBox(height: 8),

                              // ── Preview รูป ──
                              if (selectedImages.isNotEmpty) ...[
                                SizedBox(
                                  height: 110,
                                  child: ListView.builder(
                                    scrollDirection: Axis.horizontal,
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 16,
                                    ),
                                    itemCount: selectedImages.length,
                                    itemBuilder: (_, i) => Padding(
                                      padding: const EdgeInsets.only(right: 8),
                                      child: Stack(
                                        children: [
                                          ClipRRect(
                                            borderRadius: BorderRadius.circular(
                                              12,
                                            ),
                                            child: Image.file(
                                              selectedImages[i],
                                              width: 110,
                                              height: 110,
                                              fit: BoxFit.cover,
                                            ),
                                          ),
                                          Positioned(
                                            top: 4,
                                            right: 4,
                                            child: GestureDetector(
                                              onTap: () {
                                                setState(
                                                  () => selectedImages.removeAt(
                                                    i,
                                                  ),
                                                );
                                                setModal(() {});
                                              },
                                              child: Container(
                                                decoration: const BoxDecoration(
                                                  color: Colors.black54,
                                                  shape: BoxShape.circle,
                                                ),
                                                padding: const EdgeInsets.all(
                                                  4,
                                                ),
                                                child: const Icon(
                                                  Icons.close,
                                                  color: Colors.white,
                                                  size: 14,
                                                ),
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 8),
                              ],

                              const SizedBox(height: 4),
                            ],
                          ),
                        ),
                      ),

                      // ── Bottom bar (fixed) ──
                      const Divider(height: 1),

                      Container(
                        margin: const EdgeInsets.fromLTRB(16, 10, 16, 6),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 10,
                        ),
                        decoration: BoxDecoration(
                          border: Border.all(color: Colors.grey.shade300),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            Text(
                              "เพิ่มในโพสต์",
                              style: TextStyle(
                                fontWeight: FontWeight.w600,
                                color: Colors.black87,
                                fontSize: 13,
                              ),
                            ),
                            const Spacer(),
                            GestureDetector(
                              onTap: () async {
                                Navigator.pop(context);
                                await pickImages();
                                openCreatePostPopup();
                              },
                              child: const Padding(
                                padding: EdgeInsets.all(6),
                                child: Icon(
                                  Icons.photo_library,
                                  color: Color(0xFF45BD62),
                                  size: 26,
                                ),
                              ),
                            ),
                            GestureDetector(
                              onTap: () {},
                              child: const Padding(
                                padding: EdgeInsets.all(6),
                                child: Icon(
                                  Icons.emoji_emotions,
                                  color: Color(0xFFF7B928),
                                  size: 26,
                                ),
                              ),
                            ),
                            // ── ปุ่มไมค์ STT ──
                            StatefulBuilder(
                              builder: (ctx2, setStt) {
                                return GestureDetector(
                                  onTap: () async {
                                    if (_isListening) {
                                      await _tts.stopListening();
                                      setState(() => _isListening = false);
                                      setStt(() {});
                                      setModal(() {});
                                    } else {
                                      final ok = await _tts.initStt();
                                      if (!ok) {
                                        ScaffoldMessenger.of(
                                          context,
                                        ).showSnackBar(
                                          const SnackBar(
                                            content: Text(
                                              'ไม่สามารถใช้ไมโครโฟนได้',
                                            ),
                                          ),
                                        );
                                        return;
                                      }
                                      setState(() => _isListening = true);
                                      setStt(() {});
                                      setModal(() {});
                                      await _tts.startListening(
                                        onResult: (words) {
                                          postController.text = words;
                                          postController.selection =
                                              TextSelection.fromPosition(
                                                TextPosition(
                                                  offset: words.length,
                                                ),
                                              );
                                          setModal(() {});
                                        },
                                        onDone: () {
                                          setState(() => _isListening = false);
                                          setStt(() {});
                                          setModal(() {});
                                        },
                                      );
                                    }
                                  },
                                  child: Padding(
                                    padding: const EdgeInsets.all(6),
                                    child: AnimatedContainer(
                                      duration: const Duration(
                                        milliseconds: 200,
                                      ),
                                      child: Icon(
                                        _isListening
                                            ? Icons.mic
                                            : Icons.mic_none,
                                        color: _isListening
                                            ? Colors.red
                                            : const Color(0xFF3B6FD4),
                                        size: 26,
                                      ),
                                    ),
                                  ),
                                );
                              },
                            ),
                          ],
                        ),
                      ),

                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                        child: SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: () async {
                              final posted = await createPost();
                              if (posted && mounted) Navigator.pop(context);
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF1877F2),
                              foregroundColor: Colors.white,
                              elevation: 0,
                              padding: const EdgeInsets.symmetric(vertical: 13),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                            ),
                            child: const Text(
                              "โพสต์",
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  // ================= LIKE =================

  Future likePost(int postId, String type) async {
    if (_isBlocked) {
      _showBlockedInteractionMessage();
      return;
    }

    final res = await http.post(
      Uri.parse("$baseUrl/posts/$postId/like"),
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"phone": widget.phoneNumber, "type": type}),
    );

    if (res.statusCode == 403) {
      try {
        final body = jsonDecode(res.body);
        final message = (body["error"] ?? "").toString();
        if (message.isNotEmpty) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(message)));
        }
      } catch (_) {}
      await _loadModerationStatus();
      return;
    }

    loadPosts();
  }

  // ================= HIDE / SAVE / REPORT =================

  Future hidePost(int postId) async {
    try {
      final res = await http.post(
        Uri.parse("$baseUrl/posts/$postId/hide"),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({"phone": widget.phoneNumber}),
      );
      if (res.statusCode == 200) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text("ซ่อนโพสต์แล้ว")));
        loadPosts();
      }
    } catch (_) {}
  }

  Future savePost(int postId) async {
    try {
      await http.post(
        Uri.parse("$baseUrl/posts/$postId/save"),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({"phone": widget.phoneNumber}),
      );
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text("เซฟโพสต์แล้ว")));
    } catch (_) {}
  }

  Future reportPost(int postId, {String? reason, String? detail}) async {
    try {
      final cleanDetail = detail?.trim();
      await http.post(
        Uri.parse("$baseUrl/posts/$postId/report"),
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({
          "phone": widget.phoneNumber,
          if (reason != null && reason.isNotEmpty) "reason": reason,
          if (cleanDetail != null && cleanDetail.isNotEmpty)
            "detail": cleanDetail,
        }),
      );
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text("รายงานโพสต์แล้ว")));
    } catch (_) {}
  }

  Future<void> _openReportPostDialog(Map p) async {
    final reasonsWithIcons = [
      {
        "title": "สแปมหรือโฆษณา",
        "icon": Icons.check_circle_outline,
        "color": Colors.orange,
      },
      {
        "title": "ถ้อยคำไม่เหมาะสม",
        "icon": Icons.mood_bad_outlined,
        "color": Colors.red,
      },
      {
        "title": "ข้อมูลเท็จหรือทำให้เข้าใจผิด",
        "icon": Icons.warning_outlined,
        "color": Colors.purple,
      },
      {
        "title": "คุกคามหรือกลั่นแกล้ง",
        "icon": Icons.block_outlined,
        "color": Colors.redAccent,
      },
      {"title": "อื่นๆ", "icon": Icons.more_horiz, "color": Colors.grey},
    ];

    String? selectedReason;
    String? detailText;

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => _ReportPostDialog(
        reasonsWithIcons: reasonsWithIcons,
        onSubmit: (reason, detail) {
          selectedReason = reason;
          detailText = detail;
          Navigator.pop(ctx, true);
        },
      ),
    );

    if (result == true && selectedReason != null && detailText != null) {
      await reportPost(
        p["post_id"],
        reason: selectedReason,
        detail: detailText,
      );
    }
  }

  // ================= COMMENT POPUP =================

  void openComments(int postId) {
    if (_isBlocked) {
      _showBlockedInteractionMessage();
      return;
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => CommentDialog(
        postId: postId,
        currentUserPhone: widget.phoneNumber,
        baseUrl: baseUrl,
        userPhoneForCommentCreation: widget.phoneNumber,
        onCommentAdded: loadPosts,
        enableTTS: true,
        enableSTT: true,
      ),
    );
  }

  // ================= POST CARD =================

  Widget _buildPostCard(Map p) {
    return PostCard(
      post: p,
      currentUserPhone: widget.phoneNumber,
      onLike: (postId) =>
          likePost(postId, (p["user_like"] != "like") ? "like" : "remove"),
      onComment: (postId) => openComments(postId),
      onShare: () => _openShareSheet(p),
      onMenu: () {
        if (p["phone_number"] == widget.phoneNumber) {
          openPostMenu(p);
        } else {
          openPostMoreMenu(p);
        }
      },
      onAvatarTap: () => _goToProfile(p["phone_number"] ?? ""),
      onPostTap: () => Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => PostDetailPage(
            post: p,
            currentUserPhone: widget.phoneNumber,
            onPostChanged: loadPosts,
          ),
        ),
      ).then((_) => loadPosts()),
      onTtsStart: () {
        final text = p["content"] ?? "";
        if (text.isEmpty) return;
        final ttsId = 'post_${p["post_id"]}';
        _tts.speak(
          text: text,
          id: ttsId,
          onStart: (id) {
            setState(() => _speakingId = id);
          },
          onDone: (id) {
            setState(() => _speakingId = null);
          },
        );
      },
      onTtsEnd: () {
        _tts.stop();
        setState(() => _speakingId = null);
      },
      speakingId: _speakingId,
      isBlocked: _isBlocked,
    );
  }

  // ── Visibility helpers ──
  String _visibilityLabel(String v) {
    switch (v) {
      case 'friends':
        return 'เพื่อน';
      case 'followers':
        return 'ผู้ติดตาม';
      case 'only_me':
        return 'เฉพาะฉัน';
      default:
        return 'สาธารณะ';
    }
  }

  IconData _visibilityIcon(String v) {
    switch (v) {
      case 'friends':
        return Icons.people;
      case 'followers':
        return Icons.person_add;
      case 'only_me':
        return Icons.lock;
      default:
        return Icons.public;
    }
  }

  void _showGroupPicker(StateSetter setModal) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            margin: const EdgeInsets.only(top: 10, bottom: 4),
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey.shade300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text(
              'โพสต์ในกลุ่ม',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
          ),
          const Divider(height: 1),
          // Scrollable items section
          Flexible(
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // ตัวเลือก "ไม่เลือกกลุ่ม"
                  ListTile(
                    leading: Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: _selectedGroupId == null
                            ? const Color(0xFF3B6FD4).withValues(alpha: 0.12)
                            : Colors.grey.shade100,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        Icons.public,
                        color: _selectedGroupId == null
                            ? const Color(0xFF3B6FD4)
                            : Colors.grey.shade600,
                        size: 20,
                      ),
                    ),
                    title: Text(
                      'ไม่ระบุกลุ่ม',
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: _selectedGroupId == null
                            ? const Color(0xFF3B6FD4)
                            : Colors.black87,
                      ),
                    ),
                    trailing: _selectedGroupId == null
                        ? const Icon(Icons.check_circle, color: Color(0xFF3B6FD4))
                        : null,
                    onTap: () {
                      setState(() => _selectedGroupId = null);
                      setModal(() {});
                      Navigator.pop(ctx);
                    },
                  ),
                  ..._recommendedGroups.map((g) {
                    final color = Color(g['color'] as int);
                    final iconData = IconData(
                      g['icon'] as int,
                      fontFamily: 'MaterialIcons',
                    );
                    final isSelected = _selectedGroupId == g['group_id'];
                    return ListTile(
                      leading: Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: isSelected
                              ? color.withValues(alpha: 0.15)
                              : Colors.grey.shade100,
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          iconData,
                          color: isSelected ? color : Colors.grey.shade600,
                          size: 20,
                        ),
                      ),
                      title: Text(
                        g['name'] as String,
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          color: isSelected ? color : Colors.black87,
                        ),
                      ),
                      subtitle: Text(
                        g['desc'] as String,
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                      ),
                      trailing: isSelected
                          ? Icon(Icons.check_circle, color: color)
                          : null,
                      onTap: () {
                        setState(() => _selectedGroupId = g['group_id'] as int);
                        setModal(() {});
                        Navigator.pop(ctx);
                      },
                    );
                  }),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }

  void _showVisibilityPicker(StateSetter setModal) {
    final options = [
      {
        'value': 'public',
        'label': 'สาธารณะ',
        'sub': 'ทุกคนเห็นได้',
        'icon': Icons.public,
      },
      {
        'value': 'friends',
        'label': 'เพื่อน',
        'sub': 'คนที่ฟอลกันและกัน',
        'icon': Icons.people,
      },
      {
        'value': 'followers',
        'label': 'เฉพาะผู้ติดตาม',
        'sub': 'คนที่ติดตามคุณอยู่',
        'icon': Icons.person_add,
      },
      {
        'value': 'only_me',
        'label': 'เฉพาะฉัน',
        'sub': 'มองเห็นแค่คุณคนเดียว',
        'icon': Icons.lock,
      },
    ];

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (pickerCtx) => StatefulBuilder(
        builder: (_, setPicker) => Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              margin: const EdgeInsets.only(top: 10, bottom: 4),
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text(
                "ใครสามารถเห็นโพสต์นี้?",
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
            const Divider(height: 1),
            ...options.map((opt) {
              final isSelected = _selectedVisibility == opt['value'];
              return ListTile(
                leading: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: isSelected
                        ? const Color(0xFF1877F2).withValues(alpha: 0.12)
                        : Colors.grey.shade100,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    opt['icon'] as IconData,
                    color: isSelected
                        ? const Color(0xFF1877F2)
                        : Colors.black54,
                    size: 22,
                  ),
                ),
                title: Text(
                  opt['label'] as String,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: isSelected
                        ? const Color(0xFF1877F2)
                        : Colors.black87,
                  ),
                ),
                subtitle: Text(
                  opt['sub'] as String,
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                ),
                trailing: isSelected
                    ? const Icon(Icons.check_circle, color: Color(0xFF1877F2))
                    : null,
                onTap: () {
                  // อัพเดต state ทั้ง page และ popup ที่เปิดอยู่
                  setState(() => _selectedVisibility = opt['value'] as String);
                  setModal(() {});
                  // ปิดแค่ picker sheet ไม่ใช่ popup ด้านล่าง
                  Navigator.of(pickerCtx).pop();
                },
              );
            }),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  // ── Share bottom sheets ──
  void _openShareSheet(Map p) {
    if (_isBlocked) {
      _showBlockedInteractionMessage();
      return;
    }

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => ShareSheet(
        post: p,
        currentUserPhone: widget.phoneNumber,
        baseUrl: baseUrl,
        myName: _myName,
        myAvatarUrl: _myAvatarUrl,
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
        currentUserPhone: widget.phoneNumber,
        baseUrl: baseUrl,
        myName: _myName,
        myAvatarUrl: _myAvatarUrl,
        onShareComplete: loadPosts,
      ),
    );
  }

  // ================= POST OWNER MENU =================

  Future deletePost(int postId) async {
    try {
      await ApiService.deletePost(postId, widget.phoneNumber);
      await loadPosts();
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text("ลบโพสต์สำเร็จ")));
    } catch (e) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text("เกิดข้อผิดพลาด: $e")));
    }
  }

  void openPostMenu(Map p) {
    final rootContext = context; // เซฟ context ของ State ไว้ก่อน
    showModalBottomSheet(
      context: rootContext,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            margin: const EdgeInsets.only(top: 10, bottom: 4),
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey.shade300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          // ── แก้ไขโพสต์ ──
          _menuTile(
            icon: Icons.edit_outlined,
            iconColor: Colors.black87,
            title: "แก้ไขโพสต์",
            subtitle: "แก้ไขเนื้อหาและรูปภาพ",
            onTap: () {
              Navigator.pop(context);
              openEditDialog(p);
            },
          ),
          // ── เปลี่ยนการมองเห็น ──
          _menuTile(
            icon: Icons.public,
            iconColor: Colors.black87,
            title: "เปลี่ยนการมองเห็น",
            subtitle: "เลือกว่าใครเห็นโพสต์นี้ได้",
            onTap: () {
              Navigator.pop(context);
              _changePostVisibility(p);
            },
          ),
          // ── ปักหมุดโพสต์ ──
          _menuTile(
            icon: Icons.push_pin_outlined,
            iconColor: Colors.black87,
            title: "ปักหมุดโพสต์",
            subtitle: "แสดงโพสต์นี้ที่ด้านบนโปรไฟล์",
            onTap: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(
                context,
              ).showSnackBar(const SnackBar(content: Text("ปักหมุดโพสต์แล้ว")));
            },
          ),
          // ── เปิดการแจ้งเตือน ──
          _menuTile(
            icon: Icons.notifications_none,
            iconColor: Colors.black87,
            title: "เปิดการแจ้งเตือนโพสต์นี้",
            subtitle: "รับแจ้งเตือนเมื่อมีความคิดเห็น",
            onTap: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text("เปิดการแจ้งเตือนแล้ว")),
              );
            },
          ),
          const Divider(height: 1),
          // ── ลบโพสต์ ──
          _menuTile(
            icon: Icons.delete_outline,
            iconColor: Colors.red,
            title: "ลบโพสต์",
            subtitle: "ลบโพสต์นี้ออกถาวร",
            titleColor: Colors.red,
            onTap: () async {
              Navigator.pop(rootContext);
              final confirm = await showDialog<bool>(
                context: rootContext,
                builder: (_) => AlertDialog(
                  title: Text("ยืนยันการลบ"),
                  content: const Text("คุณแน่ใจหรือไม่ว่าต้องการลบโพสต์นี้?"),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(rootContext, false),
                      child: const Text("ยกเลิก"),
                    ),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.red,
                      ),
                      onPressed: () => Navigator.pop(rootContext, true),
                      child: const Text("ลบ"),
                    ),
                  ],
                ),
              );
              if (confirm == true) await deletePost(p["post_id"]);
            },
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }

  void openPostMoreMenu(Map p) {
    final rootContext = context;
    showModalBottomSheet(
      context: rootContext,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (sheetContext) {
        return SafeArea(
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  margin: const EdgeInsets.only(top: 10, bottom: 4),
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                // ── สนใจ ──
                _menuTile(
                  icon: Icons.add_circle_outline,
                  iconColor: Colors.black87,
                  title: "สนใจโพสต์นี้",
                  subtitle: "แสดงโพสต์แบบนี้เพิ่มขึ้น",
                  onTap: () {
                    Navigator.pop(sheetContext);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text("บันทึกความสนใจแล้ว")),
                    );
                  },
                ),
                // ── ไม่สนใจ ──
                _menuTile(
                  icon: Icons.remove_circle_outline,
                  iconColor: Colors.black87,
                  title: "ไม่สนใจโพสต์นี้",
                  subtitle: "แสดงโพสต์แบบนี้น้อยลง",
                  onTap: () {
                    Navigator.pop(sheetContext);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text("บันทึกแล้ว")),
                    );
                  },
                ),
                // ── เซฟโพสต์ ──
                _menuTile(
                  icon: Icons.bookmark_border,
                  iconColor: Colors.black87,
                  title: "เซฟโพสต์",
                  subtitle: "เพิ่มไปยังรายการที่บันทึกไว้",
                  onTap: () {
                    Navigator.pop(sheetContext);
                    savePost(p["post_id"]);
                  },
                ),
                // ── เปิดการแจ้งเตือน ──
                _menuTile(
                  icon: Icons.notifications_none,
                  iconColor: Colors.black87,
                  title: "เปิดการแจ้งเตือนโพสต์นี้",
                  subtitle: "รับแจ้งเตือนเมื่อมีความคิดเห็น",
                  onTap: () {
                    Navigator.pop(sheetContext);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text("เปิดการแจ้งเตือนแล้ว")),
                    );
                  },
                ),
                const Divider(height: 1),
                // ── ซ่อนโพสต์ ──
                _menuTile(
                  icon: Icons.visibility_off_outlined,
                  iconColor: Colors.black87,
                  title: "ซ่อนโพสต์",
                  subtitle: "แสดงโพสต์แบบนี้น้อยลงใน feed",
                  onTap: () {
                    Navigator.pop(sheetContext);
                    hidePost(p["post_id"]);
                  },
                ),
                // ── เลิกติดตาม ──
                if (p["phone_number"] != widget.phoneNumber)
                  _menuTile(
                    icon: Icons.person_remove_outlined,
                    iconColor: Colors.black87,
                    title: "เลิกติดตาม ${p["full_name"] ?? ""}",
                    subtitle: "หยุดรับโพสต์จากบัญชีนี้",
                    onTap: () async {
                      Navigator.pop(sheetContext);
                      await http.post(
                        Uri.parse(
                          "$baseUrl/users/${p["phone_number"]}/unfollow",
                        ),
                        headers: {"Content-Type": "application/json"},
                        body: jsonEncode({
                          "follower_phone": widget.phoneNumber,
                        }),
                      );
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text("เลิกติดตามแล้ว")),
                      );
                      loadPosts();
                    },
                  ),
                // ── รายงาน ──
                _menuTile(
                  icon: Icons.flag_outlined,
                  iconColor: Colors.red,
                  title: "รายงานโพสต์",
                  subtitle: "แจ้งว่าโพสต์นี้ละเมิดกฎชุมชน",
                  titleColor: Colors.red,
                  onTap: () async {
                    Navigator.pop(sheetContext);
                    await Future.delayed(const Duration(milliseconds: 220));
                    if (!mounted) return;
                    await _openReportPostDialog(p);
                  },
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),
        );
      },
    );
  }

  // ── helper tile widget ──
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

  // ── เปลี่ยน visibility ของโพสต์ที่มีอยู่ ──
  void _changePostVisibility(Map p) {
    final options = [
      {
        'value': 'public',
        'label': 'สาธารณะ',
        'sub': 'ทุกคนเห็นได้',
        'icon': Icons.public,
      },
      {
        'value': 'friends',
        'label': 'เพื่อน',
        'sub': 'คนที่ฟอลกันและกัน',
        'icon': Icons.people,
      },
      {
        'value': 'followers',
        'label': 'เฉพาะผู้ติดตาม',
        'sub': 'คนที่ติดตามคุณอยู่',
        'icon': Icons.person_add,
      },
      {
        'value': 'only_me',
        'label': 'เฉพาะฉัน',
        'sub': 'มองเห็นแค่คุณคนเดียว',
        'icon': Icons.lock,
      },
    ];

    String current = p["visibility"] ?? "public";

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (_, setPicker) => Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              margin: const EdgeInsets.only(top: 10, bottom: 4),
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text(
                "เปลี่ยนการมองเห็น",
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
            const Divider(height: 1),
            ...options.map((opt) {
              final isSelected = current == opt['value'];
              return ListTile(
                leading: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: isSelected
                        ? const Color(0xFF1877F2).withValues(alpha: 0.12)
                        : Colors.grey.shade100,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    opt['icon'] as IconData,
                    color: isSelected
                        ? const Color(0xFF1877F2)
                        : Colors.black54,
                    size: 22,
                  ),
                ),
                title: Text(
                  opt['label'] as String,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: isSelected
                        ? const Color(0xFF1877F2)
                        : Colors.black87,
                  ),
                ),
                subtitle: Text(
                  opt['sub'] as String,
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                ),
                trailing: isSelected
                    ? const Icon(Icons.check_circle, color: Color(0xFF1877F2))
                    : null,
                onTap: () async {
                  setPicker(() => current = opt['value'] as String);
                  Navigator.pop(ctx);
                  // อัพเดต visibility ผ่าน API
                  await http.put(
                    Uri.parse("$baseUrl/posts/${p['post_id']}"),
                    headers: {"Content-Type": "application/json"},
                    body: jsonEncode({
                      "phone": widget.phoneNumber,
                      "content": p["content"] ?? "",
                      "visibility": opt['value'],
                    }),
                  );
                  loadPosts();
                },
              );
            }),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  void openEditDialog(Map p) {
    final editController = TextEditingController(text: p["content"] ?? "");
    List<File> editImages = [];

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) {
        return StatefulBuilder(
          builder: (ctx, setModal) {
            return Padding(
              padding: EdgeInsets.only(
                bottom: MediaQuery.of(context).viewInsets.bottom,
              ),
              child: Container(
                padding: const EdgeInsets.all(16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: editController,
                      maxLines: null,
                      decoration: const InputDecoration(
                        hintText: "แก้ไขข้อความ...",
                      ),
                    ),
                    const SizedBox(height: 10),
                    if (p["images"] != null &&
                        (p["images"] as List).isNotEmpty &&
                        editImages.isEmpty)
                      Wrap(
                        spacing: 8,
                        children: List<Widget>.from(
                          (p["images"] as List).map(
                            (url) => Image.network(
                              url,
                              width: 80,
                              height: 80,
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),
                      ),
                    if (editImages.isNotEmpty)
                      SizedBox(
                        height: 100,
                        child: ListView.builder(
                          scrollDirection: Axis.horizontal,
                          itemCount: editImages.length,
                          itemBuilder: (_, i) => Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: Image.file(
                              editImages[i],
                              width: 80,
                              height: 80,
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),
                      ),
                    Row(
                      children: [
                        TextButton.icon(
                          onPressed: () async {
                            final picker = ImagePicker();
                            final imgs = await picker.pickMultiImage();
                            if (imgs.isNotEmpty) {
                              List<File> cropped = [];
                              for (final img in imgs) {
                                final r = await ImageCropper().cropImage(
                                  sourcePath: img.path,
                                  uiSettings: [
                                    AndroidUiSettings(
                                      toolbarTitle: 'ครอปรูปภาพ',
                                      toolbarColor: const Color(0xFF3B6FD4),
                                      toolbarWidgetColor: Colors.white,
                                      lockAspectRatio: false,
                                    ),
                                    IOSUiSettings(title: 'ครอปรูปภาพ'),
                                  ],
                                );
                                if (r != null) cropped.add(File(r.path));
                              }
                              setModal(() => editImages = cropped);
                            }
                          },
                          icon: const Icon(Icons.image, color: Colors.blue),
                          label: const Text("เปลี่ยนรูป"),
                        ),
                        const Spacer(),
                        ElevatedButton(
                          onPressed: () async {
                            var req = http.MultipartRequest(
                              "PUT",
                              Uri.parse("$baseUrl/posts/${p['post_id']}"),
                            );
                            req.fields["phone"] = widget.phoneNumber;
                            req.fields["content"] = editController.text;
                            for (var img in editImages) {
                              req.files.add(
                                await http.MultipartFile.fromPath(
                                  "images",
                                  img.path,
                                ),
                              );
                            }
                            await req.send();
                            if (mounted) Navigator.pop(context);
                            loadPosts();
                          },
                          child: const Text("บันทึก"),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  // ================= IMAGE GRID =================

  // ── เปิดดูรูปแบบ fullscreen ──
  void _openImageViewer(List<String> images, int startIndex) {
    Navigator.of(context).push(
      PageRouteBuilder(
        opaque: false,
        barrierColor: Colors.black,
        pageBuilder: (_, _, _) =>
            _ImageViewerPage(images: images, initialIndex: startIndex),
      ),
    );
  }

  Widget imageGrid(List images) {
    final List<String> urls = List<String>.from(images);
    final int count = urls.length;

    // helper: รูป 1 ช่อง
    Widget cell(
      String url,
      int index, {
      BorderRadius? radius,
      double height = 200,
    }) {
      return GestureDetector(
        onTap: () => _openImageViewer(urls, index),
        child: ClipRRect(
          borderRadius: radius ?? BorderRadius.zero,
          child: SizedBox(
            height: height,
            width: double.infinity,
            child: Image.network(
              url,
              fit: BoxFit.cover,
              loadingBuilder: (_, child, progress) => progress == null
                  ? child
                  : Container(
                      color: Colors.grey.shade200,
                      child: const Center(
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    ),
              errorBuilder: (_, _, _) => Container(
                color: Colors.grey.shade200,
                child: const Icon(Icons.broken_image, color: Colors.grey),
              ),
            ),
          ),
        ),
      );
    }

    // 1 รูป
    if (count == 1) {
      return cell(urls[0], 0, radius: BorderRadius.zero, height: 280);
    }

    // 2 รูป
    if (count == 2) {
      return SizedBox(
        height: 220,
        child: Row(
          children: [
            Expanded(
              child: cell(urls[0], 0, radius: BorderRadius.zero, height: 220),
            ),
            const SizedBox(width: 2),
            Expanded(
              child: cell(urls[1], 1, radius: BorderRadius.zero, height: 220),
            ),
          ],
        ),
      );
    }

    // 3 รูป
    if (count == 3) {
      return SizedBox(
        height: 220,
        child: Row(
          children: [
            Expanded(
              flex: 2,
              child: cell(urls[0], 0, radius: BorderRadius.zero, height: 220),
            ),
            const SizedBox(width: 2),
            Expanded(
              child: Column(
                children: [
                  Expanded(child: cell(urls[1], 1, height: 109)),
                  const SizedBox(height: 2),
                  Expanded(child: cell(urls[2], 2, height: 109)),
                ],
              ),
            ),
          ],
        ),
      );
    }

    // 4 รูป
    if (count == 4) {
      return SizedBox(
        height: 220,
        child: Column(
          children: [
            Expanded(
              child: Row(
                children: [
                  Expanded(child: cell(urls[0], 0, height: 109)),
                  const SizedBox(width: 2),
                  Expanded(child: cell(urls[1], 1, height: 109)),
                ],
              ),
            ),
            const SizedBox(height: 2),
            Expanded(
              child: Row(
                children: [
                  Expanded(child: cell(urls[2], 2, height: 109)),
                  const SizedBox(width: 2),
                  Expanded(child: cell(urls[3], 3, height: 109)),
                ],
              ),
            ),
          ],
        ),
      );
    }

    // 5+ รูป — แสดง 5 ช่อง ช่องสุดท้ายมี overlay "+N"
    return SizedBox(
      height: 220,
      child: Column(
        children: [
          Expanded(
            child: Row(
              children: [
                Expanded(child: cell(urls[0], 0, height: 109)),
                const SizedBox(width: 2),
                Expanded(child: cell(urls[1], 1, height: 109)),
              ],
            ),
          ),
          const SizedBox(height: 2),
          Expanded(
            child: Row(
              children: [
                Expanded(child: cell(urls[2], 2, height: 109)),
                const SizedBox(width: 2),
                Expanded(child: cell(urls[3], 3, height: 109)),
                const SizedBox(width: 2),
                Expanded(
                  child: GestureDetector(
                    onTap: () => _openImageViewer(urls, 4),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        Image.network(urls[4], fit: BoxFit.cover),
                        Container(
                          color: Colors.black54,
                          child: Center(
                            child: Text(
                              "+${count - 4}",
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 22,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ),
                      ],
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFEBECF0),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: Text(
          _isGroupMode ? _groupTitle : "พื้นที่ชุมชน",
          style: TextStyle(
            color: Colors.black87,
            fontWeight: FontWeight.bold,
            fontSize: 20,
          ),
        ),
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: () async => await loadPosts(),
              child: ListView(
                children: [
                  if (!_isGroupMode) ...[
                    // ── Recommended Groups ──
                    _buildRecommendedGroups(),
                    const SizedBox(height: 8),
                  ],
                  if (_isGroupMode) ...[
                    _buildGroupHeader(),
                    const SizedBox(height: 8),
                  ],

                  // ── Create post box (Facebook style) ──
                  Container(
                    color: Colors.white,
                    padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            CircleAvatar(
                              radius: 20,
                              backgroundColor: const Color(0xFF1877F2),
                              backgroundImage: _myAvatarUrl != null
                                  ? NetworkImage(_myAvatarUrl!)
                                  : null,
                              child: _myAvatarUrl == null
                                  ? Text(
                                      (_myName ?? widget.phoneNumber).isNotEmpty
                                          ? (_myName ?? widget.phoneNumber)[0]
                                                .toUpperCase()
                                          : "?",
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    )
                                  : null,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: GestureDetector(
                                onTap: openCreatePostPopup,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 14,
                                    vertical: 10,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Colors.grey.shade100,
                                    borderRadius: BorderRadius.circular(24),
                                    border: Border.all(
                                      color: Colors.grey.shade300,
                                    ),
                                  ),
                                  child: Text(
                                    "คุณกำลังคิดอะไรอยู่?",
                                    style: TextStyle(
                                      color: Colors.grey.shade500,
                                      fontSize: 15,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Divider(
                            height: 1,
                            color: Colors.grey.shade200,
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                            children: [
                              _createBoxAction(
                                icon: Icons.photo_library,
                                color: const Color(0xFF45BD62),
                                label: "รูปภาพ",
                                onTap: () async {
                                  await pickImages();
                                  if (selectedImages.isNotEmpty) {
                                    openCreatePostPopup();
                                  }
                                },
                              ),
                              _createBoxAction(
                                icon: Icons.emoji_emotions,
                                color: const Color(0xFFF7B928),
                                label: "ความรู้สึก",
                                onTap: openCreatePostPopup,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 8),

                  // ── Posts (with sponsored articles injected every 5 posts) ──
                  if (posts.isEmpty)
                    _buildEmptyFeed()
                  else
                    ..._buildFeedWithAds(),
                ],
              ),
            ),
    );
  }

  // ================= EMPTY FEED STATE =================

  Widget _buildEmptyFeed() {
    return Container(
      color: Colors.white,
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              _loadError ? Icons.wifi_off_outlined : Icons.forum_outlined,
              size: 56,
              color: Colors.grey.shade400,
            ),
            const SizedBox(height: 16),
            Text(
              _loadError ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' : 'ยังไม่มีโพสต์',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.grey.shade600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _loadError
                  ? 'เซิร์ฟเวอร์อาจเปิดตัวอยู่ กรุณารอสักครู่แล้วลองใหม่'
                  : 'เป็นคนแรกที่แบ่งปันเรื่องราวในชุมชน',
              style: TextStyle(fontSize: 13, color: Colors.grey.shade500),
              textAlign: TextAlign.center,
            ),
            if (_loadError) ...[
              const SizedBox(height: 20),
              ElevatedButton.icon(
                onPressed: loadPosts,
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('ลองใหม่'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF3B6FD4),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(20)),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  // ================= GROUP CONTEXT HEADER =================

  Widget _buildGroupHeader() {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _groupTitle,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.black87,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'ฟีดเฉพาะโพสต์ของกลุ่มนี้',
                  style: TextStyle(color: Colors.grey, fontSize: 12),
                ),
              ],
            ),
          ),
          if (_groupStatusLoading)
            const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          else if (_isGroupMember)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFFE8F5E9),
                borderRadius: BorderRadius.circular(999),
              ),
              child: const Text(
                'สมาชิกแล้ว',
                style: TextStyle(
                  color: Color(0xFF2E7D32),
                  fontWeight: FontWeight.w700,
                ),
              ),
            )
          else
            ElevatedButton(
              onPressed: _joinCurrentGroup,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF3B6FD4),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              child: const Text('เข้าร่วมกลุ่ม'),
            ),
        ],
      ),
    );
  }

  // ================= RECOMMENDED GROUPS SECTION =================

  Widget _buildRecommendedGroups() {
    final textScale = MediaQuery.textScalerOf(context).scale(1.0);
    final cardsHeight = (130 + ((textScale - 1.0) * 46)).clamp(130, 186).toDouble();
    final cardWidth = (150 + ((textScale - 1.0) * 24)).clamp(150, 186).toDouble();

    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(12, 14, 0, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'กลุ่มที่แนะนำ',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.bold,
                    color: Colors.black87,
                  ),
                ),
                TextButton(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('เลือกจากกลุ่มแนะนำด้านล่างได้เลย'),
                      ),
                    );
                  },
                  child: const Text(
                    'ดูทั้งหมด',
                    style: TextStyle(
                      color: Color(0xFF3B6FD4),
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 6),
          SizedBox(
            height: cardsHeight,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _recommendedGroups.length,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (context, i) {
                final g = _recommendedGroups[i];
                final color = Color(g['color'] as int);
                final iconData = IconData(
                  g['icon'] as int,
                  fontFamily: 'MaterialIcons',
                );
                return GestureDetector(
                  onTap: () {
                    final groupId = g['group_id'] as int;
                    final groupName = g['name'] as String;
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => CommunityPage(
                          phoneNumber: widget.phoneNumber,
                          groupId: groupId,
                          groupName: groupName,
                        ),
                      ),
                    ).then((_) => loadPosts());
                  },
                  child: Container(
                    width: cardWidth,
                    decoration: BoxDecoration(
                      color: color,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.25),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(iconData, color: Colors.white, size: 20),
                        ),
                        const SizedBox(height: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              Text(
                                g['name'] as String,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 13,
                                  height: 1.2,
                                ),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 2),
                              Text(
                                g['desc'] as String,
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.85),
                                  fontSize: 11,
                                  height: 1.2,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
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
      ),
    );
  }

  Widget _createBoxAction({
    required IconData icon,
    required Color color,
    required String label,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: Row(
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 6),
            Text(
              label,
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 13,
                color: Colors.black54,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ================= IMAGE VIEWER (Fullscreen) =================

class _ImageViewerPage extends StatefulWidget {
  final List<String> images;
  final int initialIndex;

  const _ImageViewerPage({required this.images, required this.initialIndex});

  @override
  State<_ImageViewerPage> createState() => _ImageViewerPageState();
}

class _ImageViewerPageState extends State<_ImageViewerPage> {
  late PageController _pageController;
  late int _current;

  @override
  void initState() {
    super.initState();
    _current = widget.initialIndex;
    _pageController = PageController(initialPage: widget.initialIndex);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // ── PageView รูปภาพ ──
          PageView.builder(
            controller: _pageController,
            itemCount: widget.images.length,
            onPageChanged: (i) => setState(() => _current = i),
            itemBuilder: (_, i) => InteractiveViewer(
              minScale: 0.5,
              maxScale: 4.0,
              child: Center(
                child: Image.network(
                  widget.images[i],
                  fit: BoxFit.contain,
                  loadingBuilder: (_, child, progress) => progress == null
                      ? child
                      : const Center(
                          child: CircularProgressIndicator(color: Colors.white),
                        ),
                  errorBuilder: (_, _, _) => const Icon(
                    Icons.broken_image,
                    color: Colors.white54,
                    size: 60,
                  ),
                ),
              ),
            ),
          ),

          // ── Top bar ──
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.white),
                    onPressed: () => Navigator.pop(context),
                  ),
                  const Spacer(),
                  if (widget.images.length > 1)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black45,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        "${_current + 1} / ${widget.images.length}",
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                        ),
                      ),
                    ),
                  const SizedBox(width: 8),
                ],
              ),
            ),
          ),

          // ── Dot indicators ──
          if (widget.images.length > 1)
            Positioned(
              bottom: 24,
              left: 0,
              right: 0,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  widget.images.length,
                  (i) => AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    width: _current == i ? 20 : 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: _current == i ? Colors.white : Colors.white38,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ================= EXPANDABLE TEXT =================

class ExpandableText extends StatefulWidget {
  final String text;
  final int maxLines;
  const ExpandableText({super.key, required this.text, this.maxLines = 3});

  @override
  State<ExpandableText> createState() => _ExpandableTextState();
}

class _ExpandableTextState extends State<ExpandableText> {
  bool _isExpanded = false;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final tp = TextPainter(
          text: TextSpan(text: widget.text),
          maxLines: widget.maxLines,
          textDirection: TextDirection.ltr,
        )..layout(maxWidth: constraints.maxWidth);

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.text,
              maxLines: _isExpanded ? null : widget.maxLines,
              overflow: _isExpanded ? null : TextOverflow.ellipsis,
            ),
            if (tp.didExceedMaxLines)
              GestureDetector(
                onTap: () => setState(() => _isExpanded = !_isExpanded),
                child: Text(
                  _isExpanded ? "แสดงน้อยลง" : "แสดงเพิ่มเติม",
                  style: const TextStyle(
                    color: Colors.blue,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

// ================= REPORT POST DIALOG =================

class _ReportPostDialog extends StatefulWidget {
  final List<Map<String, dynamic>> reasonsWithIcons;
  final Function(String reason, String detail) onSubmit;

  const _ReportPostDialog({
    required this.reasonsWithIcons,
    required this.onSubmit,
  });

  @override
  State<_ReportPostDialog> createState() => _ReportPostDialogState();
}

class _ReportPostDialogState extends State<_ReportPostDialog> {
  late String selectedReason;
  late TextEditingController detailController;

  @override
  void initState() {
    super.initState();
    selectedReason = widget.reasonsWithIcons.first["title"];
    detailController = TextEditingController();
  }

  @override
  void dispose() {
    detailController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reasons = widget.reasonsWithIcons
        .map((r) => r["title"] as String)
        .toList();

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 400),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Container(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
              decoration: const BoxDecoration(
                color: Color(0xFFF5F5F5),
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(16),
                  topRight: Radius.circular(16),
                ),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.red.shade100,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.flag,
                      color: Colors.red.shade700,
                      size: 24,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          "รายงานโพสต์",
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          "ช่วยเราปรับปรุงชุมชน",
                          style: TextStyle(fontSize: 12, color: Colors.grey),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            // Content
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    "เหตุผลการรายงาน",
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Colors.black87,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey.shade300),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: DropdownButtonFormField<String>(
                      value: selectedReason,
                      decoration: const InputDecoration(
                        border: InputBorder.none,
                        contentPadding: EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 12,
                        ),
                      ),
                      items: reasons.asMap().entries.map((entry) {
                        final idx = entry.key;
                        final reason = entry.value;
                        final iconData =
                            widget.reasonsWithIcons[idx]["icon"] as IconData;
                        final color =
                            widget.reasonsWithIcons[idx]["color"] as Color;
                        return DropdownMenuItem<String>(
                          value: reason,
                          child: Row(
                            children: [
                              Icon(iconData, color: color, size: 20),
                              const SizedBox(width: 10),
                              Text(reason),
                            ],
                          ),
                        );
                      }).toList(),
                      onChanged: (value) {
                        if (value == null) return;
                        setState(() => selectedReason = value);
                      },
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    "รายละเอียดเพิ่มเติม",
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Colors.black87,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: detailController,
                    maxLines: 4,
                    keyboardType: TextInputType.multiline,
                    inputFormatters: [LengthLimitingTextInputFormatter(2000)],
                    textInputAction: TextInputAction.newline,
                    enableInteractiveSelection: true,
                    enableSuggestions: true,
                    enableIMEPersonalizedLearning: true,
                    obscureText: false,
                    autocorrect: false,
                    decoration: InputDecoration(
                      hintText: "บอกเราว่าทำไมคุณถึงรายงานโพสต์นี้...",
                      hintStyle: TextStyle(
                        color: Colors.grey.shade500,
                        fontSize: 13,
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: BorderSide(color: Colors.grey.shade300),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: BorderSide(color: Colors.grey.shade300),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: const BorderSide(
                          color: Color(0xFF3B6FD4),
                          width: 2,
                        ),
                      ),
                      contentPadding: const EdgeInsets.all(12),
                    ),
                  ),
                ],
              ),
            ),
            // Actions
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text(
                      "ยกเลิก",
                      style: TextStyle(color: Colors.grey),
                    ),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red.shade600,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 20,
                        vertical: 10,
                      ),
                    ),
                    onPressed: () {
                      widget.onSubmit(selectedReason, detailController.text);
                    },
                    child: const Text(
                      "ส่งรายงาน",
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
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
}

