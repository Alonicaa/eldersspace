import 'package:flutter/material.dart';

import 'services/app_settings_service.dart';
import 'services/tts_stt_service.dart';

class AppSettingsPage extends StatefulWidget {
  final String? phoneNumber;

  const AppSettingsPage({super.key, this.phoneNumber});

  @override
  State<AppSettingsPage> createState() => _AppSettingsPageState();
}

class _AppSettingsPageState extends State<AppSettingsPage> {
  final _settings = AppSettingsService.instance;
  final _ttsService = TtsSttService.instance;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    await _settings.setActiveUser(widget.phoneNumber);
    await _settings.load(userKey: widget.phoneNumber);
    if (mounted) setState(() {});
  }

  Widget _buildSizeOption({
    required String label,
    required bool isSelected,
    required VoidCallback onTap,
    bool isFirst = false,
    bool isLast = false,
  }) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(
            color: isSelected ? const Color(0xFF1565C0) : Colors.transparent,
            borderRadius: BorderRadius.horizontal(
              left: isFirst ? const Radius.circular(11) : Radius.zero,
              right: isLast ? const Radius.circular(11) : Radius.zero,
            ),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: isSelected ? Colors.white : Colors.grey.shade700,
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final currentVoice = _settings.ttsVoiceName ?? TtsSttService.availableVoices.first['name']!;

    return Scaffold(
      appBar: AppBar(title: const Text('ตั้งค่าภายในแอพ')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── ขนาดตัวอักษร ──
          const Text(
            'ขนาดตัวอักษร',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          ValueListenableBuilder<bool>(
            valueListenable: _settings.elderModeNotifier,
            builder: (context, isElder, _) {
              return ValueListenableBuilder<double>(
                valueListenable: _settings.fontScaleNotifier,
                builder: (context, scale, _) {
                  final String selected = isElder
                      ? 'large'
                      : (scale < 0.95 ? 'small' : 'medium');
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        decoration: BoxDecoration(
                          border: Border.all(color: Colors.grey.shade300),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            _buildSizeOption(
                              label: 'เล็ก',
                              isSelected: selected == 'small',
                              isFirst: true,
                              onTap: () async {
                                await _settings.setElderMode(false);
                                await _settings.setFontScale(0.85);
                              },
                            ),
                            Container(
                              width: 1,
                              height: 52,
                              color: Colors.grey.shade300,
                            ),
                            _buildSizeOption(
                              label: 'กลาง',
                              isSelected: selected == 'medium',
                              onTap: () async {
                                await _settings.setElderMode(false);
                                await _settings.setFontScale(1.0);
                              },
                            ),
                            Container(
                              width: 1,
                              height: 52,
                              color: Colors.grey.shade300,
                            ),
                            _buildSizeOption(
                              label: 'ใหญ่',
                              isSelected: selected == 'large',
                              isLast: true,
                              onTap: () => _settings.setElderMode(true),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'ตัวอย่างข้อความ',
                        style: TextStyle(fontSize: 16, color: Colors.grey.shade700),
                      ),
                    ],
                  );
                },
              );
            },
          ),
          const SizedBox(height: 24),

          // ── เสียงอ่าน TTS ──
          const Text(
            'เสียงอ่าน TTS',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          Text(
            'ขับเคลื่อนโดย Google Cloud Text-to-Speech',
            style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
          ),
          const SizedBox(height: 12),
          ...TtsSttService.availableVoices.map((voice) {
            final name = voice['name']!;
            final label = voice['label']!;
            final isSelected = currentVoice == name;
            return _VoiceOptionTile(
              name: name,
              label: label,
              isSelected: isSelected,
              onTap: () async {
                await _settings.setTtsVoice(name: name, locale: 'th-TH');
                await _ttsService.refreshSettings();
                if (mounted) setState(() {});
              },
            );
          }),
          const SizedBox(height: 24),

          // ── ความเร็วการอ่าน ──
          const Text(
            'ความเร็วการอ่าน',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Builder(builder: (context) {
            final speed = _settings.ttsSpeed;
            return Container(
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey.shade300),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  _buildSizeOption(
                    label: 'ช้า',
                    isSelected: speed == 'slow',
                    isFirst: true,
                    onTap: () async {
                      await _settings.setTtsSpeed('slow');
                      await _ttsService.refreshSettings();
                      if (mounted) setState(() {});
                    },
                  ),
                  Container(width: 1, height: 52, color: Colors.grey.shade300),
                  _buildSizeOption(
                    label: 'ปกติ',
                    isSelected: speed == 'normal',
                    onTap: () async {
                      await _settings.setTtsSpeed('normal');
                      await _ttsService.refreshSettings();
                      if (mounted) setState(() {});
                    },
                  ),
                  Container(width: 1, height: 52, color: Colors.grey.shade300),
                  _buildSizeOption(
                    label: 'เร็ว',
                    isSelected: speed == 'fast',
                    isLast: true,
                    onTap: () async {
                      await _settings.setTtsSpeed('fast');
                      await _ttsService.refreshSettings();
                      if (mounted) setState(() {});
                    },
                  ),
                ],
              ),
            );
          }),
          const SizedBox(height: 16),
          ElevatedButton.icon(
            onPressed: () async {
              await _ttsService.speak(
                text: 'นี่คือเสียงตัวอย่างสำหรับการอ่านออกเสียง',
                id: 'settings-voice-preview',
              );
            },
            icon: const Icon(Icons.volume_up),
            label: const Text('ทดสอบเสียงที่เลือก'),
          ),
        ],
      ),
    );
  }
}

class _VoiceOptionTile extends StatelessWidget {
  final String name;
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _VoiceOptionTile({
    required this.name,
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF1565C0).withValues(alpha: 0.08) : Colors.white,
          border: Border.all(
            color: isSelected ? const Color(0xFF1565C0) : Colors.grey.shade300,
            width: isSelected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            Icon(
              isSelected ? Icons.radio_button_checked : Icons.radio_button_off,
              color: isSelected ? const Color(0xFF1565C0) : Colors.grey.shade400,
              size: 22,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: isSelected ? const Color(0xFF1565C0) : Colors.black87,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    name,
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
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
  }
}
