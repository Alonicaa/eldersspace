import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:audioplayers/audioplayers.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import 'app_settings_service.dart';
import 'app_config.dart';

// ════════════════════════════════════════════════════════
//  TTS / STT Service  –  Google Cloud TTS + native STT
// ════════════════════════════════════════════════════════

class TtsSttService {
  TtsSttService._internal();
  static final TtsSttService instance = TtsSttService._internal();

  // ─── TTS ───
  final AudioPlayer _audioPlayer = AudioPlayer();
  String? _currentlyReadingId;

  // ─── STT ───
  final stt.SpeechToText _stt = stt.SpeechToText();
  bool _sttAvailable = false;

  // ─── Available voices (fixed list) ───────────────────────────────────────
  static const List<Map<String, String>> availableVoices = [
    {'name': 'th-TH-Chirp3-HD-Achernar', 'label': 'Achernar (Chirp3 HD)'},
    {'name': 'th-TH-Chirp3-HD-Aoede',    'label': 'Aoede (Chirp3 HD)'},
    {'name': 'th-TH-Neural2-C',           'label': 'Neural2-C'},
  ];

  String get _selectedVoiceName {
    final saved = AppSettingsService.instance.ttsVoiceName;
    if (saved != null && availableVoices.any((v) => v['name'] == saved)) {
      return saved;
    }
    return availableVoices.first['name']!;
  }

  // ════════════════════════════════════════
  //  INIT
  // ════════════════════════════════════════

  Future<void> initTts() async {}

  Future<void> refreshSettings() async {
    await AppSettingsService.instance.load();
  }

  Future<bool> initStt() async {
    _sttAvailable = await _stt.initialize(
      onError: (e) {},
      onStatus: (s) {},
    );
    return _sttAvailable;
  }

  // ════════════════════════════════════════
  //  TTS – อ่านข้อความผ่าน Google Cloud TTS
  // ════════════════════════════════════════

  /// Returns `true` เมื่อเล่นจนจบสำเร็จ, `false` เมื่อหยุดหรือเกิดข้อผิดพลาด
  Future<bool> speak({
    required String text,
    required String id,
    VoidCallbackWithId? onStart,
    VoidCallbackWithId? onDone,
    void Function(String id, String message)? onError,
  }) async {
    // กด TTS ซ้ำ = หยุด
    if (_currentlyReadingId == id) {
      await stop();
      onDone?.call(id);
      return false;
    }

    await _audioPlayer.stop();
    _currentlyReadingId = id;
    onStart?.call(id);

    final voiceName    = _selectedVoiceName;
    final speakingRate = AppSettingsService.instance.ttsSpeakingRate;
    final chunks       = _splitText(text);

    debugPrint('[TTS] $voiceName | ${chunks.length} chunks | rate=$speakingRate');

    try {
      for (final chunk in chunks) {
        // ถูก stop() เรียกระหว่างรอ
        if (_currentlyReadingId != id) break;

        final bytes = await _fetchAudio(
          chunk: chunk,
          voiceName: voiceName,
          speakingRate: speakingRate,
          id: id,
          onError: onError,
        );
        if (bytes == null) return false; // error ถูก handle แล้ว

        if (_currentlyReadingId != id) break;

        await _playChunkAndWait(bytes);

        if (_currentlyReadingId != id) break;
      }

      final completed = _currentlyReadingId == id;
      _currentlyReadingId = null;
      if (completed) onDone?.call(id);
      return completed;
    } catch (e) {
      debugPrint('[TTS] exception: $e');
      _currentlyReadingId = null;
      onError?.call(id, e.toString());
      return false;
    }
  }

  // ─── เล่น 1 chunk แล้วรอจนจบ ─────────────────────────────────────────────
  Future<void> _playChunkAndWait(Uint8List bytes) async {
    final completer = Completer<void>();
    late StreamSubscription<PlayerState> sub;
    sub = _audioPlayer.onPlayerStateChanged.listen((state) {
      if (state == PlayerState.completed || state == PlayerState.stopped) {
        sub.cancel();
        if (!completer.isCompleted) completer.complete();
      }
    });
    await _audioPlayer.play(BytesSource(bytes));
    await completer.future;
  }

  // ─── เรียก Google Cloud TTS API ──────────────────────────────────────────
  Future<Uint8List?> _fetchAudio({
    required String chunk,
    required String voiceName,
    required double speakingRate,
    required String id,
    void Function(String id, String message)? onError,
  }) async {
    try {
      final url = Uri.parse(
        'https://texttospeech.googleapis.com/v1beta1/text:synthesize'
        '?key=${AppConfig.googleTtsApiKey}',
      );
      final response = await http
          .post(
            url,
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'input': {'text': chunk},
              'voice': {'languageCode': 'th-TH', 'name': voiceName},
              'audioConfig': {
                'audioEncoding': 'MP3',
                'speakingRate': speakingRate,
              },
            }),
          )
          .timeout(const Duration(seconds: 15));

      debugPrint('[TTS] status=${response.statusCode} chunk="${chunk.length} chars"');

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        return base64Decode(data['audioContent'] as String);
      }

      // Parse Google error message
      String errMsg = 'HTTP ${response.statusCode}';
      try {
        final body  = jsonDecode(response.body) as Map<String, dynamic>;
        final error = body['error'] as Map<String, dynamic>?;
        errMsg = error?['message']?.toString() ?? errMsg;
      } catch (_) {}
      debugPrint('[TTS] error: $errMsg\n${response.body}');
      _currentlyReadingId = null;
      onError?.call(id, errMsg);
      return null;
    } catch (e) {
      debugPrint('[TTS] fetch exception: $e');
      _currentlyReadingId = null;
      onError?.call(id, e.toString());
      return null;
    }
  }

  // ─── ตัดข้อความเป็น chunk ≤ 300 ตัวอักษร ─────────────────────────────────
  List<String> _splitText(String text, {int maxLen = 300}) {
    if (text.length <= maxLen) return [text];

    // แยกตามตัวแบ่งประโยค
    final parts = text.split(RegExp(r'(?<=[.!?\n。？！ฯ])\s*'));
    final chunks = <String>[];
    var current  = '';

    for (final part in parts) {
      if (part.isEmpty) continue;
      if (current.isEmpty) {
        current = part;
      } else if (current.length + part.length + 1 <= maxLen) {
        current += ' $part';
      } else {
        if (current.isNotEmpty) chunks.add(current);
        current = part;
      }
    }
    if (current.isNotEmpty) chunks.add(current);

    // ตัด chunk ที่ยาวเกิน (ไม่มีตัวแบ่งประโยค) โดยใช้ช่องว่าง
    final result = <String>[];
    for (final chunk in chunks) {
      if (chunk.length <= maxLen) {
        result.add(chunk);
      } else {
        var remaining = chunk;
        while (remaining.length > maxLen) {
          var cut = maxLen;
          final spaceIdx = remaining.lastIndexOf(' ', maxLen);
          if (spaceIdx > maxLen ~/ 2) cut = spaceIdx;
          result.add(remaining.substring(0, cut).trim());
          remaining = remaining.substring(cut).trim();
        }
        if (remaining.isNotEmpty) result.add(remaining);
      }
    }

    return result.where((s) => s.isNotEmpty).toList();
  }

  // ═════════════════════════════════
  //  stop / state helpers
  // ═════════════════════════════════

  Future<void> stop() async {
    _currentlyReadingId = null; // signals loop to stop
    await _audioPlayer.stop(); // triggers PlayerState.stopped → completes _playChunkAndWait
  }

  bool isReading(String id) => _currentlyReadingId == id;
  bool get isPlayingAny     => _currentlyReadingId != null;

  // ════════════════════════════════════════
  //  STT – รับเสียงเป็นข้อความ (native)
  // ════════════════════════════════════════

  Future<void> startListening({
    required Function(String words) onResult,
    required Function() onDone,
    String localeId = 'th_TH',
  }) async {
    if (!_sttAvailable) _sttAvailable = await initStt();
    if (!_sttAvailable) return;

    await _stt.listen(
      onResult: (result) {
        onResult(result.recognizedWords);
        if (result.finalResult) onDone();
      },
      localeId: localeId,
      listenFor: const Duration(seconds: 30),
      pauseFor: const Duration(seconds: 3),
    );
  }

  Future<void> stopListening() async => _stt.stop();

  bool get isListening => _stt.isListening;
}

typedef VoidCallbackWithId = void Function(String id);
