import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:image_cropper/image_cropper.dart';
import 'services/api_service.dart';
import 'home_page.dart';

class SetProfilePage extends StatefulWidget {
  final String phoneNumber;
  final String displayName;

  const SetProfilePage({
    super.key,
    required this.phoneNumber,
    required this.displayName,
  });

  @override
  State<SetProfilePage> createState() => _SetProfilePageState();
}

class _SetProfilePageState extends State<SetProfilePage> {
  File? _selectedImage;
  String? _currentAvatarUrl;
  bool _isUploading = false;

  @override
  void initState() {
    super.initState();
    _loadCurrentAvatar();
  }

  Future<void> _loadCurrentAvatar() async {
    try {
      final url = await ApiService.getProfilePictureUrl(widget.phoneNumber);
      if (mounted) setState(() => _currentAvatarUrl = url);
    } catch (_) {}
  }

  Future<void> _pickAndCrop() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
    );
    if (picked == null) return;

    final cropped = await ImageCropper().cropImage(
      sourcePath: picked.path,
      aspectRatio: const CropAspectRatio(ratioX: 1, ratioY: 1),
      uiSettings: [
        AndroidUiSettings(
          toolbarTitle: 'ครอปรูปโปรไฟล์',
          toolbarColor: const Color(0xFF3B6FD4),
          toolbarWidgetColor: Colors.white,
          initAspectRatio: CropAspectRatioPreset.square,
          lockAspectRatio: true,
          hideBottomControls: false,
          showCropGrid: true,
          statusBarColor: const Color(0xFF3B6FD4), // เพิ่ม
          activeControlsWidgetColor: const Color(0xFF3B6FD4), // เพิ่ม
        ),
        IOSUiSettings(
          title: 'ครอปรูปโปรไฟล์',
          aspectRatioLockEnabled: true,
          resetAspectRatioEnabled: false,
          doneButtonTitle: 'ตกลง', // เพิ่ม - ทำให้เห็นปุ่มชัดขึ้น
          cancelButtonTitle: 'ยกเลิก', // เพิ่ม
        ),
      ],
    );

    if (cropped != null) {
      setState(() => _selectedImage = File(cropped.path));
    }
  }

  Future<void> _uploadAvatar() async {
    if (_selectedImage == null) return;
    setState(() => _isUploading = true);
    try {
      final url = await ApiService.uploadProfilePicture(
        widget.phoneNumber,
        _selectedImage!.path,
      );
      setState(() {
        _currentAvatarUrl = url;
        _selectedImage = null;
      });
      _showSnack('อัพโหลดรูปโปรไฟล์สำเร็จ ✅');
    } catch (e) {
      _showSnack('อัพโหลดล้มเหลว: $e');
    } finally {
      setState(() => _isUploading = false);
    }
  }

  void proceed() async {
    if (_selectedImage != null) await _uploadAvatar();
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(
        builder: (_) => HomePage(phoneNumber: widget.phoneNumber),
      ),
      (route) => false,
    );
  }

  void skip() {
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(
        builder: (_) => HomePage(phoneNumber: widget.phoneNumber),
      ),
      (route) => false,
    );
  }

  void _showSnack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    Widget avatarWidget;
    if (_selectedImage != null) {
      avatarWidget = CircleAvatar(
        radius: 60,
        backgroundImage: FileImage(_selectedImage!),
      );
    } else if (_currentAvatarUrl != null) {
      avatarWidget = CircleAvatar(
        radius: 60,
        backgroundImage: NetworkImage(_currentAvatarUrl!),
      );
    } else {
      avatarWidget = const CircleAvatar(
        radius: 60,
        backgroundColor: Color(0xFFEEEEEE),
        child: Icon(Icons.image_outlined, size: 40, color: Color(0xFFBBBBBB)),
      );
    }

    final media = MediaQuery.of(context);
    return MediaQuery(
      data: media.copyWith(textScaler: TextScaler.linear(1.0)),
      child: Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
              child: TextButton.icon(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(
                  Icons.chevron_left,
                  color: Color(0xFF444444),
                  size: 22,
                ),
                label: const Text(
                  'ย้อนกลับ',
                  style: TextStyle(color: Color(0xFF444444), fontSize: 15),
                ),
                style: TextButton.styleFrom(alignment: Alignment.centerLeft),
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(28, 16, 28, 28),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'เพิ่มรูปโปรไฟล์',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF1A3A6B),
                      ),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'เพิ่มรูปภาพให้เป็นของคุณ ๆ ทราบว่าเป็นคุณ\nทุกคนจะมองเห็นรูปภาพของคุณได้',
                      style: TextStyle(
                        fontSize: 14,
                        color: Color(0xFF888888),
                        height: 1.6,
                      ),
                    ),
                    const SizedBox(height: 40),

                    // Avatar picker
                    Center(
                      child: GestureDetector(
                        onTap: _isUploading ? null : _pickAndCrop,
                        child: Stack(
                          children: [
                            avatarWidget,
                            Positioned(
                              right: 4,
                              bottom: 4,
                              child: Container(
                                width: 34,
                                height: 34,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: const Color(0xFF3B6FD4),
                                  border: Border.all(
                                    color: Colors.white,
                                    width: 2,
                                  ),
                                  boxShadow: const [
                                    BoxShadow(
                                      color: Color(0x223B6FD4),
                                      blurRadius: 8,
                                    ),
                                  ],
                                ),
                                child: const Icon(
                                  Icons.camera_alt,
                                  color: Colors.white,
                                  size: 18,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 12),

                    Center(
                      child: Text(
                        _selectedImage != null || _currentAvatarUrl != null
                            ? 'แตะเพื่อเปลี่ยนรูป'
                            : 'แตะเพื่อเลือกรูปภาพ',
                        style: const TextStyle(
                          fontSize: 13,
                          color: Color(0xFF3B6FD4),
                        ),
                      ),
                    ),

                    // ปุ่ม upload ทันที (แสดงหลังจากเลือกรูป)
                    if (_selectedImage != null) ...[
                      const SizedBox(height: 16),
                      Center(
                        child: _isUploading
                            ? const CircularProgressIndicator()
                            : OutlinedButton.icon(
                                onPressed: _uploadAvatar,
                                icon: const Icon(
                                  Icons.cloud_upload,
                                  color: Color(0xFF3B6FD4),
                                ),
                                label: const Text(
                                  'อัพโหลดรูปทันที',
                                  style: TextStyle(color: Color(0xFF3B6FD4)),
                                ),
                                style: OutlinedButton.styleFrom(
                                  side: const BorderSide(
                                    color: Color(0xFF3B6FD4),
                                  ),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(24),
                                  ),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 20,
                                    vertical: 10,
                                  ),
                                ),
                              ),
                      ),
                    ],

                    const SizedBox(height: 48),

                    // ปุ่ม ถัดไป
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: ElevatedButton(
                        onPressed: _isUploading ? null : proceed,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF3B6FD4),
                          foregroundColor: Colors.white,
                          disabledBackgroundColor: const Color(
                            0xFF3B6FD4,
                          ).withValues(alpha: 0.6),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          elevation: 0,
                        ),
                        child: _isUploading
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(
                                  color: Colors.white,
                                  strokeWidth: 2.5,
                                ),
                              )
                            : const Text(
                                'ถัดไป',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                      ),
                    ),

                    const SizedBox(height: 12),

                    // ปุ่ม ข้าม
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: OutlinedButton(
                        onPressed: skip,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFF444444),
                          side: const BorderSide(color: Color(0xFFDDDDDD)),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: const Text(
                          'ข้าม',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w500,
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
      ),
    );
  }
}

