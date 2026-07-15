import 'package:flutter_test/flutter_test.dart';

import 'package:eldersspace/services/app_settings_service.dart';

void main() {
  test('Elder mode defaults to enabled', () {
    expect(AppSettingsService.instance.elderModeNotifier.value, isTrue);
  });

  test('Font scale defaults to 1.0 before any per-user override loads', () {
    expect(AppSettingsService.instance.fontScaleNotifier.value, 1.0);
  });
}
