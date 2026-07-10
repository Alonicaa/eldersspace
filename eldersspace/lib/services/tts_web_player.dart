// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;
import 'dart:async';
import 'dart:typed_data';

Future<void> playWebAudio(Uint8List bytes) async {
  final completer = Completer<void>();

  // Blob URL โหลดเร็วกว่า data URI สำหรับ audio binary
  final blob = html.Blob([bytes], 'audio/mpeg');
  final url = html.Url.createObjectUrlFromBlob(blob);

  final audio = html.AudioElement();
  audio.src = url;
  audio.style.display = 'none';
  html.document.body?.append(audio);

  StreamSubscription? endSub;
  StreamSubscription? errSub;

  void done() {
    endSub?.cancel();
    errSub?.cancel();
    audio.remove();
    html.Url.revokeObjectUrl(url);
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
