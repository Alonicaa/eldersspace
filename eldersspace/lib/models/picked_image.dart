import 'dart:typed_data';
import 'package:http/http.dart' as http;

/// Cross-platform stand-in for `dart:io File` when handling images picked or
/// cropped by the user. `dart:io File` cannot be constructed on Flutter Web,
/// so image bytes are read once (via `readAsBytes()`, which both `XFile` and
/// `CroppedFile` support on every platform) and kept in memory instead.
class PickedImage {
  final Uint8List bytes;
  final String name;

  const PickedImage(this.bytes, this.name);

  /// Reads bytes from anything exposing `readAsBytes()` + `path`
  /// (`XFile` from image_picker, `CroppedFile` from image_cropper).
  static Future<PickedImage> from(dynamic file) async {
    final Uint8List bytes = await file.readAsBytes();
    final String path = file.path as String;
    final name = path.split(RegExp(r'[\\/]')).last;
    return PickedImage(bytes, name.isEmpty ? 'image.jpg' : name);
  }

  http.MultipartFile toMultipartFile(String field) {
    return http.MultipartFile.fromBytes(field, bytes, filename: name);
  }
}
