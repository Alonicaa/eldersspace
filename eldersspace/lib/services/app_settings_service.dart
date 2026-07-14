import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AppSettingsService {
  AppSettingsService._();
  static final AppSettingsService instance = AppSettingsService._();

  static const _fontScaleKey   = 'app_font_scale';
  static const _elderModeKey   = 'app_elder_mode';
  static const _ttsVoiceNameKey  = 'tts_voice_name';
  static const _ttsVoiceLocaleKey = 'tts_voice_locale';
  static const _ttsSpeedKey    = 'tts_speed';
  static const _savedPhoneKey  = 'logged_in_phone';

  final ValueNotifier<double> fontScaleNotifier = ValueNotifier<double>(1.0);
  final ValueNotifier<bool>   elderModeNotifier = ValueNotifier<bool>(true);

  SharedPreferences? _prefs;
  String? _ttsVoiceName;
  String? _ttsVoiceLocale;
  String  _ttsSpeed = 'normal';
  String? _activeUserKey;

  // ─── Storage key helpers (all settings are per-user) ─────────────────────

  String _normalizedUserKey(String? userKey) => userKey?.trim() ?? '';

  String get _fontScaleStorageKey    => _perUser(_fontScaleKey);
  String get _elderModeStorageKey    => _perUser(_elderModeKey);
  String get _ttsVoiceNameStorageKey  => _perUser(_ttsVoiceNameKey);
  String get _ttsVoiceLocaleStorageKey => _perUser(_ttsVoiceLocaleKey);
  String get _ttsSpeedStorageKey     => _perUser(_ttsSpeedKey);

  String _perUser(String base) {
    final key = _normalizedUserKey(_activeUserKey);
    return key.isEmpty ? base : '${base}_$key';
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  /// เบอร์ที่ login ค้างไว้ (persist session) — null ถ้ายังไม่เคย login หรือ logout แล้ว
  String? get savedPhone => _prefs?.getString(_savedPhoneKey);

  Future<void> setSavedPhone(String phone) async {
    _prefs ??= await SharedPreferences.getInstance();
    await _prefs!.setString(_savedPhoneKey, phone);
  }

  Future<void> clearSavedPhone() async {
    _prefs ??= await SharedPreferences.getInstance();
    await _prefs!.remove(_savedPhoneKey);
  }

  String? get ttsVoiceName =>
      _ttsVoiceName?.isNotEmpty == true ? _ttsVoiceName : 'th-TH-Chirp3-HD-Achernar';
  String? get ttsVoiceLocale => _ttsVoiceLocale;
  String  get ttsSpeed => _ttsSpeed;

  /// speakingRate ที่ส่งให้ Google Cloud TTS
  double get ttsSpeakingRate {
    switch (_ttsSpeed) {
      case 'slow': return 0.7;
      case 'fast': return 1.4;
      default:     return 1.0;
    }
  }

  // ─── Load / setActiveUser ─────────────────────────────────────────────────

  Future<void> load({String? userKey}) async {
    _prefs ??= await SharedPreferences.getInstance();
    if (userKey != null) _activeUserKey = _normalizedUserKey(userKey);

    fontScaleNotifier.value = _prefs!.getDouble(_fontScaleStorageKey) ?? 1.0;
    elderModeNotifier.value = _prefs!.getBool(_elderModeStorageKey)   ?? true;

    _ttsVoiceName  = _prefs!.getString(_ttsVoiceNameStorageKey);
    _ttsVoiceLocale = _prefs!.getString(_ttsVoiceLocaleStorageKey);
    _ttsSpeed      = _prefs!.getString(_ttsSpeedStorageKey) ?? 'normal';
  }

  Future<void> setActiveUser(String? userKey) async {
    _prefs ??= await SharedPreferences.getInstance();
    _activeUserKey = _normalizedUserKey(userKey);

    fontScaleNotifier.value = _prefs!.getDouble(_fontScaleStorageKey) ?? 1.0;
    elderModeNotifier.value = _prefs!.getBool(_elderModeStorageKey)   ?? true;

    _ttsVoiceName  = _prefs!.getString(_ttsVoiceNameStorageKey);
    _ttsVoiceLocale = _prefs!.getString(_ttsVoiceLocaleStorageKey);
    _ttsSpeed      = _prefs!.getString(_ttsSpeedStorageKey) ?? 'normal';
  }

  // ─── Setters ──────────────────────────────────────────────────────────────

  Future<void> setElderMode(bool value) async {
    _prefs ??= await SharedPreferences.getInstance();
    elderModeNotifier.value = value;
    await _prefs!.setBool(_elderModeStorageKey, value);
  }

  Future<void> setFontScale(double value) async {
    _prefs ??= await SharedPreferences.getInstance();
    fontScaleNotifier.value = value;
    await _prefs!.setDouble(_fontScaleStorageKey, value);
  }

  Future<void> setTtsVoice({String? name, String? locale}) async {
    _prefs ??= await SharedPreferences.getInstance();
    _ttsVoiceName  = name;
    _ttsVoiceLocale = locale;

    if (name == null || name.isEmpty) {
      await _prefs!.remove(_ttsVoiceNameStorageKey);
    } else {
      await _prefs!.setString(_ttsVoiceNameStorageKey, name);
    }

    if (locale == null || locale.isEmpty) {
      await _prefs!.remove(_ttsVoiceLocaleStorageKey);
    } else {
      await _prefs!.setString(_ttsVoiceLocaleStorageKey, locale);
    }
  }

  Future<void> setTtsSpeed(String speed) async {
    _prefs ??= await SharedPreferences.getInstance();
    _ttsSpeed = speed;
    await _prefs!.setString(_ttsSpeedStorageKey, speed);
  }
}
