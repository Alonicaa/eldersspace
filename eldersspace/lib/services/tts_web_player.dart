// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;
import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

Future<void> playWebAudio(Uint8List bytes) async {
  final completer = Completer<void>();
  final audio = html.AudioElement();
  audio.src = 'data:audio/mpeg;base64,${base64Encode(bytes)}';

  StreamSubscription? endSub;
  StreamSubscription? errSub;

  void done() {
    endSub?.cancel();
    errSub?.cancel();
    if (!completer.isCompleted) completer.complete();
  }

  endSub = audio.onEnded.listen((_) => done());
  errSub = audio.onError.listen((_) => done());

  try {
    await audio.play();
  } catch (_) {
    done();
    return;
  }

  await completer.future.timeout(const Duration(minutes: 3));
}
