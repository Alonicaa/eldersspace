// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;
// ignore: avoid_web_libraries_in_flutter
import 'dart:web_audio';
import 'dart:async';
import 'dart:typed_data';

Future<void> playWebAudio(Uint8List bytes) async {
  final completer = Completer<void>();

  // Web Audio API: ไม่ต้องการ user activation ใหม่ถ้า AudioContext ยัง running
  final ctx = AudioContext();

  try {
    final buffer = await ctx.decodeAudioData(bytes.buffer);

    final source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connectNode(ctx.destination!);

    source.onEnded.listen((_) {
      if (!completer.isCompleted) completer.complete();
      ctx.close();
    });

    source.start(0);
  } catch (e) {
    ctx.close();
    if (!completer.isCompleted) completer.complete();
    return;
  }

  await completer.future.timeout(const Duration(minutes: 3));
}
