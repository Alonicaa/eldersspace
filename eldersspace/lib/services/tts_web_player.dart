import 'dart:async';
import 'dart:js_interop';
import 'dart:typed_data';
import 'package:web/web.dart' as web;

Future<void> playWebAudio(Uint8List bytes) async {
  final completer = Completer<void>();

  // Web Audio API: ไม่ต้องการ user activation ใหม่ถ้า AudioContext ยัง running
  final ctx = web.AudioContext();

  try {
    final buffer = await ctx.decodeAudioData(bytes.buffer.toJS).toDart;

    final source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    source.onended = (web.Event _) {
      if (!completer.isCompleted) completer.complete();
      ctx.close();
    }.toJS;

    source.start();
  } catch (e) {
    ctx.close();
    if (!completer.isCompleted) completer.complete();
    return;
  }

  await completer.future.timeout(const Duration(minutes: 3));
}
