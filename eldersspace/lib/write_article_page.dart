import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'models/picked_image.dart';
import 'services/api_service.dart';
import 'services/app_settings_service.dart';

class WriteArticlePage extends StatefulWidget {
  final String phoneNumber;
  final String? initialCategory;
  const WriteArticlePage({
    super.key,
    required this.phoneNumber,
    this.initialCategory,
  });

  @override
  State<WriteArticlePage> createState() => _WriteArticlePageState();
}

class _WriteArticlePageState extends State<WriteArticlePage> {
  final _formKey = GlobalKey<FormState>();
  final _titleCtrl       = TextEditingController();
  final _authorCtrl      = TextEditingController();
  final _summaryCtrl     = TextEditingController();
  final _headlineCtrl    = TextEditingController();
  final _introCtrl       = TextEditingController();
  final _bodyCtrl        = TextEditingController();
  final _conclusionCtrl  = TextEditingController();

  static const _cats = ['ทั่วไป', 'สุขภาพ', 'โภชนาการ', 'จิตใจ'];
  late String _category;
  PickedImage? _coverImage;
  bool _submitting = false;
  bool _hasDraft = false;
  Timer? _draftTimer;

  String get _draftKey => 'article_draft_${widget.phoneNumber}';

  @override
  void initState() {
    super.initState();
    _category = widget.initialCategory ?? 'สุขภาพ';
    _prefillAuthor();
    _checkDraft();
    for (final ctrl in [_titleCtrl, _summaryCtrl, _headlineCtrl, _introCtrl, _bodyCtrl, _conclusionCtrl]) {
      ctrl.addListener(_scheduleDraftSave);
    }
  }

  Future<void> _prefillAuthor() async {
    final profile = await ApiService.getUserProfile(widget.phoneNumber);
    if (mounted) _authorCtrl.text = profile['full_name']?.toString() ?? '';
  }

  // ── Draft ──────────────────────────────────────────────────────────────────

  Future<void> _checkDraft() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_draftKey);
    if (raw == null || !mounted) return;
    try {
      final data = jsonDecode(raw) as Map<String, dynamic>;
      final hasContent = (data['title'] as String? ?? '').isNotEmpty ||
          (data['body'] as String? ?? '').isNotEmpty;
      if (!hasContent) return;
      setState(() => _hasDraft = true);
      _showRestoreDialog(data);
    } catch (_) {}
  }

  void _showRestoreDialog(Map<String, dynamic> data) {
    final savedAt = data['saved_at'] as String? ?? '';
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.edit_note, color: Color(0xFF1565C0)),
            SizedBox(width: 8),
            Flexible(child: Text('พบแบบร่างที่บันทึกไว้')),
          ],
        ),
        content: Text(
          'มีแบบร่างที่ยังไม่ได้ส่ง${savedAt.isNotEmpty ? '\nบันทึกเมื่อ $savedAt' : ''}\nต้องการโหลดต่อไหม?',
          style: const TextStyle(height: 1.5),
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _clearDraft();
              setState(() => _hasDraft = false);
            },
            child: const Text('ทิ้งแบบร่าง', style: TextStyle(color: Colors.red)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF1565C0),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            onPressed: () {
              Navigator.pop(context);
              _restoreDraft(data);
            },
            child: const Text('โหลดแบบร่าง'),
          ),
        ],
      ),
    );
  }

  void _restoreDraft(Map<String, dynamic> data) {
    _titleCtrl.text      = data['title'] as String? ?? '';
    _summaryCtrl.text    = data['summary'] as String? ?? '';
    _headlineCtrl.text   = data['headline'] as String? ?? '';
    _introCtrl.text      = data['introduction'] as String? ?? '';
    _bodyCtrl.text       = data['body'] as String? ?? '';
    _conclusionCtrl.text = data['conclusion'] as String? ?? '';
    if (_cats.contains(data['category'])) {
      setState(() => _category = data['category'] as String);
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Text('โหลดแบบร่างสำเร็จ'),
        backgroundColor: const Color(0xFF1565C0),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }

  void _scheduleDraftSave() {
    _draftTimer?.cancel();
    _draftTimer = Timer(const Duration(seconds: 2), _saveDraft);
  }

  Future<void> _saveDraft() async {
    if (!mounted) return;
    final data = {
      'title':        _titleCtrl.text,
      'summary':      _summaryCtrl.text,
      'headline':     _headlineCtrl.text,
      'introduction': _introCtrl.text,
      'body':         _bodyCtrl.text,
      'conclusion':   _conclusionCtrl.text,
      'category':     _category,
      'saved_at':     _formatNow(),
    };
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_draftKey, jsonEncode(data));
    if (mounted && !_hasDraft) setState(() => _hasDraft = true);
  }

  Future<void> _clearDraft() async {
    _draftTimer?.cancel();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_draftKey);
  }

  String _formatNow() {
    final now = DateTime.now();
    return '${now.day}/${now.month}/${now.year} ${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);
    try {
      final result = await ApiService.submitArticle(
        phoneNumber:  widget.phoneNumber,
        title:        _titleCtrl.text.trim(),
        authorName:   _authorCtrl.text.trim(),
        summary:      _summaryCtrl.text.trim(),
        headline:     _headlineCtrl.text.trim(),
        introduction: _introCtrl.text.trim(),
        body:         _bodyCtrl.text.trim(),
        conclusion:   _conclusionCtrl.text.trim(),
        category:     _category,
        coverImage:   _coverImage,
      );
      if (!mounted) return;
      if (result['success'] == true || result['article_id'] != null) {
        await _clearDraft();
        _showSuccess();
      } else {
        _showError(result['error']?.toString() ?? 'เกิดข้อผิดพลาด');
      }
    } catch (e) {
      if (mounted) _showError('ไม่สามารถส่งบทความได้: $e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _showSuccess() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.check_circle, color: Color(0xFF1565C0), size: 28),
            SizedBox(width: 8),
            Text('ส่งบทความสำเร็จ!'),
          ],
        ),
        content: const Text(
          'บทความของคุณถูกส่งเพื่อรอการอนุมัติจากผู้ดูแลระบบ\n'
          'หลังจากได้รับการอนุมัติจะแสดงในหน้าสุขภาพ',
          style: TextStyle(height: 1.5),
        ),
        actions: [
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF1565C0),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            onPressed: () {
              Navigator.of(context).pop();
              Navigator.of(context).pop();
            },
            child: const Text('ตกลง'),
          ),
        ],
      ),
    );
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: Colors.red,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }

  @override
  void dispose() {
    _draftTimer?.cancel();
    _titleCtrl.dispose(); _authorCtrl.dispose(); _summaryCtrl.dispose();
    _headlineCtrl.dispose(); _introCtrl.dispose(); _bodyCtrl.dispose();
    _conclusionCtrl.dispose();
    super.dispose();
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: AppSettingsService.instance.elderModeNotifier,
      builder: (context, isElder, _) {
        final fs = isElder ? 16.0 : 14.0;
        final labelFs = isElder ? 15.0 : 13.0;
        return Scaffold(
          backgroundColor: const Color(0xFFF5F5F5),
          appBar: AppBar(
            backgroundColor: const Color(0xFF1565C0),
            foregroundColor: Colors.white,
            title: const Text('เขียนบทความ',
                style: TextStyle(fontWeight: FontWeight.bold)),
            actions: [
              if (_hasDraft)
                Padding(
                  padding: const EdgeInsets.only(right: 4),
                  child: Tooltip(
                    message: 'บันทึกแบบร่างอัตโนมัติ',
                    child: Icon(Icons.save, size: 18, color: Colors.white.withValues(alpha: 0.7)),
                  ),
                ),
              IconButton(
                icon: const Icon(Icons.save_outlined),
                tooltip: 'บันทึกแบบร่าง',
                onPressed: () async {
                  await _saveDraft();
                  if (!mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: const Text('บันทึกแบบร่างแล้ว'),
                      backgroundColor: const Color(0xFF1565C0),
                      behavior: SnackBarBehavior.floating,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      duration: const Duration(seconds: 2),
                    ),
                  );
                },
              ),
            ],
          ),
          body: Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_hasDraft)
                  Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE3F2FD),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFF90CAF9)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.edit_note, size: 18, color: Color(0xFF1565C0)),
                        const SizedBox(width: 8),
                        const Expanded(
                          child: Text('กำลังบันทึกแบบร่างอัตโนมัติ',
                              style: TextStyle(fontSize: 12, color: Color(0xFF1565C0))),
                        ),
                        GestureDetector(
                          onTap: () async {
                            final ok = await showDialog<bool>(
                              context: context,
                              builder: (_) => AlertDialog(
                                title: const Text('ลบแบบร่าง?'),
                                content: const Text('แบบร่างที่บันทึกไว้จะถูกลบ'),
                                actions: [
                                  TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('ยกเลิก')),
                                  TextButton(
                                    onPressed: () => Navigator.pop(context, true),
                                    child: const Text('ลบ', style: TextStyle(color: Colors.red)),
                                  ),
                                ],
                              ),
                            );
                            if (ok == true) {
                              await _clearDraft();
                              if (mounted) setState(() => _hasDraft = false);
                            }
                          },
                          child: const Text('ลบแบบร่าง',
                              style: TextStyle(fontSize: 12, color: Colors.red, fontWeight: FontWeight.w600)),
                        ),
                      ],
                    ),
                  ),
                _sectionHeader('ข้อมูลทั่วไป', isElder),
                _buildCard([
                  _field('ชื่อบทความ *', _titleCtrl, fs, labelFs,
                      hint: 'เช่น สุขภาพหัวใจสำหรับวัย 60+',
                      validator: (v) => (v?.trim().isEmpty ?? true) ? 'กรุณากรอกชื่อบทความ' : null),
                  _categoryDropdown(labelFs, fs),
                  _field('เรื่องย่อ', _summaryCtrl, fs, labelFs,
                      hint: 'สรุปใจความสั้นๆ (2-3 ประโยค)',
                      maxLines: 3),
                ]),
                const SizedBox(height: 16),
                _sectionHeader('รูปประกอบ', isElder),
                _buildCard([_coverImagePicker(isElder)]),
                const SizedBox(height: 16),
                _sectionHeader('เนื้อหาบทความ', isElder),
                _buildCard([
                  _field('Headline (พาดหัว)', _headlineCtrl, fs, labelFs,
                      hint: 'คำโปรยดึงดูดผู้อ่าน'),
                  _field('Introduction (บทนำ)', _introCtrl, fs, labelFs,
                      hint: 'เกริ่นนำเนื้อหา', maxLines: 4),
                  _field('Body (เนื้อหาหลัก) *', _bodyCtrl, fs, labelFs,
                      hint: 'เนื้อหาโดยละเอียด', maxLines: 8,
                      validator: (v) => (v?.trim().isEmpty ?? true) ? 'กรุณากรอกเนื้อหาหลัก' : null),
                  _field('Conclusion (สรุป)', _conclusionCtrl, fs, labelFs,
                      hint: 'สรุปประเด็นสำคัญ', maxLines: 3),
                ]),
                const SizedBox(height: 16),
                Container(
                  margin: const EdgeInsets.only(bottom: 4),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE8F5E9),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFFA5D6A7)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.info_outline, color: Color(0xFF1565C0), size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'บทความจะถูกตรวจสอบโดยผู้ดูแลระบบก่อนเผยแพร่',
                          style: TextStyle(
                            fontSize: isElder ? 14 : 12,
                            color: const Color(0xFF1565C0),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _submitting ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF1565C0),
                      foregroundColor: Colors.white,
                      padding: EdgeInsets.symmetric(vertical: isElder ? 18 : 15),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      disabledBackgroundColor: Colors.grey[300],
                    ),
                    child: _submitting
                        ? const SizedBox(
                            height: 20, width: 20,
                            child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                          )
                        : Text(
                            'ส่งบทความเพื่อรอการอนุมัติ',
                            style: TextStyle(fontSize: isElder ? 17 : 15, fontWeight: FontWeight.bold),
                          ),
                  ),
                ),
                const SizedBox(height: 32),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _sectionHeader(String title, bool isElder) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        title,
        style: TextStyle(
          fontSize: isElder ? 17 : 15,
          fontWeight: FontWeight.bold,
          color: const Color(0xFF1565C0),
        ),
      ),
    );
  }

  Widget _buildCard(List<Widget> children) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: children
            .expand((w) => [w, const SizedBox(height: 12)])
            .toList()
            ..removeLast(),
      ),
    );
  }

  Widget _readOnlyAuthorField(
    TextEditingController ctrl,
    double fs,
    double labelFs,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('ชื่อผู้เขียน',
            style: TextStyle(fontSize: labelFs, fontWeight: FontWeight.w500)),
        const SizedBox(height: 6),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          decoration: BoxDecoration(
            color: Colors.grey[100],
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.grey[300]!),
          ),
          child: Row(
            children: [
              Icon(Icons.person_outline, size: fs, color: Colors.grey[500]),
              const SizedBox(width: 8),
              Expanded(
                child: ValueListenableBuilder<TextEditingValue>(
                  valueListenable: ctrl,
                  builder: (_, v, __) => Text(
                    v.text.isEmpty ? 'กำลังโหลด...' : v.text,
                    style: TextStyle(
                      fontSize: fs,
                      color: v.text.isEmpty ? Colors.grey[400] : Colors.grey[700],
                    ),
                  ),
                ),
              ),
              Icon(Icons.lock_outline, size: 13, color: Colors.grey[400]),
            ],
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'ใช้ชื่อบัญชีอัตโนมัติ',
          style: TextStyle(fontSize: 11, color: Colors.grey[400]),
        ),
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _field(
    String label,
    TextEditingController ctrl,
    double fs,
    double labelFs, {
    String? hint,
    int maxLines = 1,
    String? Function(String?)? validator,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: labelFs, fontWeight: FontWeight.w500)),
        const SizedBox(height: 6),
        TextFormField(
          controller: ctrl,
          maxLines: maxLines,
          style: TextStyle(fontSize: fs),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: TextStyle(fontSize: fs - 1, color: Colors.grey[400]),
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Color(0xFFA5D6A7)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Color(0xFF1565C0), width: 1.5),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Color(0xFFBBDEFB)),
            ),
          ),
          validator: validator,
        ),
      ],
    );
  }

  Widget _categoryDropdown(double labelFs, double fs) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('หมวดหมู่ *', style: TextStyle(fontSize: labelFs, fontWeight: FontWeight.w500)),
        const SizedBox(height: 6),
        DropdownButtonFormField<String>(
          value: _category,
          style: TextStyle(fontSize: fs, color: Colors.black87),
          decoration: InputDecoration(
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Color(0xFFA5D6A7)),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Color(0xFFBBDEFB)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Color(0xFF1565C0), width: 1.5),
            ),
          ),
          items: _cats
              .map((c) => DropdownMenuItem(value: c, child: Text(c, style: TextStyle(fontSize: fs))))
              .toList(),
          onChanged: (v) {
            setState(() => _category = v ?? _cats[0]);
            _scheduleDraftSave();
          },
        ),
      ],
    );
  }

  Widget _coverImagePicker(bool isElder) {
    return GestureDetector(
      onTap: _pickImage,
      child: _coverImage != null
          ? ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Stack(
                children: [
                  Image.memory(_coverImage!.bytes, width: double.infinity, height: 180, fit: BoxFit.cover),
                  Positioned(
                    top: 8, right: 8,
                    child: GestureDetector(
                      onTap: () => setState(() => _coverImage = null),
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: const BoxDecoration(
                          color: Colors.black54, shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.close, color: Colors.white, size: 18),
                      ),
                    ),
                  ),
                ],
              ),
            )
          : Container(
              width: double.infinity,
              height: 140,
              decoration: BoxDecoration(
                color: const Color(0xFFE3F2FD),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFF90CAF9), style: BorderStyle.solid),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.add_photo_alternate_outlined, size: 36, color: Color(0xFF1565C0)),
                  const SizedBox(height: 6),
                  Text('เพิ่มรูปประกอบ',
                      style: TextStyle(fontSize: isElder ? 15 : 13, color: const Color(0xFF1565C0))),
                  const SizedBox(height: 4),
                  Text('แนะนำ 1200×630 px, ไม่เกิน 5 MB',
                      style: TextStyle(fontSize: isElder ? 12 : 11, color: Colors.grey)),
                ],
              ),
            ),
    );
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery, imageQuality: 80);
    if (picked == null) return;
    final image = await PickedImage.from(picked);
    if (mounted) setState(() => _coverImage = image);
  }
}
