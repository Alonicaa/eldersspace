import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import '../services/tts_stt_service.dart';
import '../services/reward_service.dart';

class CommentDialog extends StatefulWidget {
  final int postId;
  final String currentUserPhone;
  final String baseUrl;
  final String? userPhoneForCommentCreation;
  final VoidCallback onCommentAdded;
  final bool enableTTS;
  final bool enableSTT;

  const CommentDialog({
    super.key,
    required this.postId,
    required this.currentUserPhone,
    required this.baseUrl,
    this.userPhoneForCommentCreation,
    required this.onCommentAdded,
    this.enableTTS = true,
    this.enableSTT = true,
  });

  @override
  State<CommentDialog> createState() => _CommentDialogState();
}

class _CommentDialogState extends State<CommentDialog> {
  static const int _maxCommentLength = 2000;

  late TextEditingController commentController;
  late FocusNode commentFocusNode;
  bool _isListening = false;
  String? _speakingId;
  bool _loading = true;
  List<Map<String, dynamic>> _comments = [];
  int? _replyToCommentId;
  String? _replyToName;
  int? _editingCommentId;
  final _tts = TtsSttService.instance;

  @override
  void initState() {
    super.initState();
    commentController = TextEditingController();
    commentFocusNode = FocusNode();
    _loadComments();
  }

  @override
  void dispose() {
    commentController.dispose();
    commentFocusNode.dispose();
    _tts.stop();
    _tts.stopListening();
    super.dispose();
  }

  Future<void> _stopSttIfListening() async {
    if (!_isListening) return;
    await _tts.stopListening();
    if (mounted) setState(() => _isListening = false);
  }

  int? _toNullableInt(dynamic value) {
    if (value == null) return null;
    if (value is int) return value;
    return int.tryParse(value.toString());
  }

  bool _isDeleted(Map<String, dynamic> comment) {
    return _toNullableInt(comment['is_deleted']) == 1;
  }

  bool _isMine(Map<String, dynamic> comment) {
    final commentPhone = (comment['user_phone'] ?? '').toString();
    return commentPhone.isNotEmpty && commentPhone == widget.currentUserPhone;
  }

  String _timeAgo(dynamic raw) {
    if (raw == null) return '';
    try {
      final value = raw.toString().trim();
      if (value.isEmpty) return '';
      final when = DateTime.parse(value).toLocal();
      final diff = DateTime.now().difference(when);
      if (diff.inDays > 0) return '${diff.inDays}d';
      if (diff.inHours > 0) return '${diff.inHours}h';
      if (diff.inMinutes > 0) return '${diff.inMinutes}m';
      return 'now';
    } catch (_) {
      return '';
    }
  }

  Future<void> _loadComments() async {
    setState(() => _loading = true);

    final response = await http.get(
      Uri.parse('${widget.baseUrl}/comments/${widget.postId}'),
    );

    if (response.statusCode != 200) {
      if (mounted) {
        setState(() {
          _loading = false;
          _comments = [];
        });
      }
      return;
    }

    try {
      final data = jsonDecode(response.body);
      if (data is List) {
        final parsed = data
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        if (mounted) {
          setState(() {
            _comments = parsed;
            _loading = false;
          });
        }
        return;
      }
    } catch (_) {}

    if (mounted) {
      setState(() {
        _comments = [];
        _loading = false;
      });
    }
  }

  Future<void> _submitComment() async {
    final text = commentController.text.trim();
    if (text.isEmpty) return;

    if (text.length > _maxCommentLength) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('ความคิดเห็นต้องไม่เกิน $_maxCommentLength ตัวอักษร'),
          ),
        );
      }
      return;
    }

    await _tts.stop();
    setState(() => _isListening = false);

    try {
      if (_editingCommentId != null) {
        final response = await http.put(
          Uri.parse('${widget.baseUrl}/comments/item/$_editingCommentId'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'phone': widget.currentUserPhone,
            'content': text,
          }),
        );

        if (response.statusCode != 200) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('แก้ไขคอมเมนต์ไม่สำเร็จ')),
            );
          }
          return;
        }
      } else {
        final userPhone =
            widget.userPhoneForCommentCreation ?? widget.currentUserPhone;

        final response = await http.post(
          Uri.parse('${widget.baseUrl}/comments/${widget.postId}'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'phone': userPhone,
            'content': text,
            'parent_id': _replyToCommentId,
          }),
        );

        if (response.statusCode == 403) {
          String message = 'บัญชีนี้ถูกจำกัดการมีส่วนร่วมชั่วคราว';
          try {
            final data = jsonDecode(response.body);
            if (data is Map && (data['error'] ?? '').toString().isNotEmpty) {
              message = data['error'].toString();
            }
          } catch (_) {}

          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(message)),
            );
          }
          return;
        }

        if (response.statusCode != 200) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('ส่งคอมเมนต์ไม่สำเร็จ')),
            );
          }
          return;
        }

        // trigger reward ทันทีหลังคอมเมนต์สำเร็จ (fire-and-forget)
        RewardService.checkCommentActivity(userPhone);
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('ไม่สามารถเชื่อมต่อได้ กรุณาลองใหม่')),
        );
      }
      return;
    }

    commentController.clear();
    setState(() {
      _replyToCommentId = null;
      _replyToName = null;
      _editingCommentId = null;
    });
    await _loadComments();
    widget.onCommentAdded();
  }

  Future<void> _deleteComment(int commentId) async {
    try {
      final response = await http.delete(
        Uri.parse('${widget.baseUrl}/comments/item/$commentId'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'phone': widget.currentUserPhone}),
      );

      if (response.statusCode != 200) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('ลบคอมเมนต์ไม่สำเร็จ')),
          );
        }
        return;
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('ไม่สามารถเชื่อมต่อได้ กรุณาลองใหม่')),
        );
      }
      return;
    }

    if (_editingCommentId == commentId) {
      commentController.clear();
      setState(() {
        _editingCommentId = null;
      });
    }

    if (_replyToCommentId == commentId) {
      setState(() {
        _replyToCommentId = null;
        _replyToName = null;
      });
    }

    await _loadComments();
    widget.onCommentAdded();
  }

  Future<void> _reportComment(int commentId, String reason, String detail) async {
    try {
      final response = await http.post(
        Uri.parse('${widget.baseUrl}/comments/item/$commentId/report'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'phone': widget.currentUserPhone,
          'reason': reason.isNotEmpty ? reason : null,
          'detail': detail.isNotEmpty ? detail : null,
        }),
      );

      if (mounted) {
        if (response.statusCode == 400) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('คุณได้รายงานคอมเมนต์นี้แล้ว')),
          );
        } else if (response.statusCode == 200) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('รายงานคอมเมนต์แล้ว')),
          );
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('รายงานคอมเมนต์ไม่สำเร็จ')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('เกิดข้อผิดพลาด')),
        );
      }
    }
  }

  Future<void> _openReportCommentDialog(int commentId, String authorName) async {
    final reasonsWithIcons = [
      {
        "title": "สแปมหรือโฆษณา",
        "icon": Icons.check_circle_outline,
        "color": Colors.orange,
      },
      {
        "title": "ถ้อยคำไม่เหมาะสม",
        "icon": Icons.mood_bad_outlined,
        "color": Colors.red,
      },
      {
        "title": "ข้อมูลเท็จหรือทำให้เข้าใจผิด",
        "icon": Icons.warning_outlined,
        "color": Colors.purple,
      },
      {
        "title": "คุกคามหรือกลั่นแกล้ง",
        "icon": Icons.block_outlined,
        "color": Colors.redAccent,
      },
      {"title": "อื่นๆ", "icon": Icons.more_horiz, "color": Colors.grey},
    ];

    String? selectedReason;
    String? detailText;

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => _ReportCommentDialog(
        reasonsWithIcons: reasonsWithIcons,
        authorName: authorName,
        onSubmit: (reason, detail) {
          selectedReason = reason;
          detailText = detail;
          Navigator.pop(ctx, true);
        },
      ),
    );

    if (result == true && selectedReason != null && detailText != null) {
      await _reportComment(commentId, selectedReason!, detailText!);
    }
  }

  Map<int?, List<Map<String, dynamic>>> _groupByParent() {
    final map = <int?, List<Map<String, dynamic>>>{};
    for (final comment in _comments) {
      final parentId = _toNullableInt(comment['parent_id']);
      map.putIfAbsent(parentId, () => []).add(comment);
    }
    return map;
  }

  Map<String, dynamic>? _commentById(int? commentId) {
    if (commentId == null) return null;
    for (final comment in _comments) {
      if (_toNullableInt(comment['comment_id']) == commentId) {
        return comment;
      }
    }
    return null;
  }

  String? _replyToLabel(Map<String, dynamic> comment) {
    final parentId = _toNullableInt(comment['parent_id']);
    final parent = _commentById(parentId);
    if (parent == null) return null;

    final parentName = (parent['full_name'] ?? '').toString().trim();
    if (parentName.isEmpty) return null;
    return 'ตอบกลับ ${parentName.length > 18 ? '${parentName.substring(0, 18)}…' : parentName}';
  }

  Widget _buildCommentNode(
    Map<String, dynamic> comment,
    int depth,
    Map<int?, List<Map<String, dynamic>>> grouped,
  ) {
    final commentId = _toNullableInt(comment['comment_id']);
    final isMine = _isMine(comment);
    final isDeleted = _isDeleted(comment);
    final fullName = (comment['full_name'] ?? 'ไม่มีชื่อ').toString();
    final content = (comment['content'] ?? '').toString();
    final ttsId = 'comment_${commentId ?? fullName.hashCode}_${depth.toString()}';
    final isReading = _speakingId == ttsId;
    final children = grouped[commentId] ?? const <Map<String, dynamic>>[];
    final leftPad = (depth * 18).toDouble().clamp(0.0, 54.0).toDouble();
    final threadIndent = depth > 0 ? 10.0 : 0.0;
    final createdAt = _timeAgo(comment['created_at']);
    final replyToLabel = _replyToLabel(comment);
    final avatarText = fullName.isNotEmpty ? fullName.substring(0, 1).toUpperCase() : '?';

    return Padding(
      padding: EdgeInsets.only(left: leftPad, right: 2, top: 3, bottom: 3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            decoration: depth > 0
                ? BoxDecoration(
                    border: Border(
                      left: BorderSide(
                        color: Colors.grey.shade300,
                        width: 1.2,
                      ),
                    ),
                  )
                : null,
            padding: EdgeInsets.only(left: threadIndent),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  radius: 14,
                  backgroundColor: const Color(0xFFDDE3F0),
                  backgroundImage: comment['profile_picture_url'] != null
                      ? NetworkImage(comment['profile_picture_url'].toString())
                      : null,
                  child: comment['profile_picture_url'] == null
                      ? Text(
                          avatarText,
                          style: const TextStyle(
                            color: Color(0xFF3B6FD4),
                            fontWeight: FontWeight.bold,
                            fontSize: 12,
                          ),
                        )
                      : null,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (replyToLabel != null) ...[
                        Padding(
                          padding: const EdgeInsets.only(left: 4, bottom: 4),
                          child: Text(
                            replyToLabel,
                            style: TextStyle(
                              color: Colors.grey.shade600,
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: const Color(0xFF2C2F36),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              fullName,
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              content,
                              style: TextStyle(
                                height: 1.3,
                                color: isDeleted ? Colors.white70 : Colors.white,
                                fontStyle:
                                    isDeleted ? FontStyle.italic : FontStyle.normal,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Text(
                            'Like',
                            style: TextStyle(
                              color: Colors.grey.shade700,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(width: 10),
                          if (!isDeleted)
                            GestureDetector(
                              onTap: () {
                                setState(() {
                                  _replyToCommentId = commentId;
                                  _replyToName = fullName;
                                  _editingCommentId = null;
                                });
                                commentFocusNode.requestFocus();
                              },
                              child: Text(
                                'Reply',
                                style: TextStyle(
                                  color: Colors.grey.shade700,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          if (createdAt.isNotEmpty) ...[
                            const SizedBox(width: 10),
                            Text(
                              createdAt,
                              style: TextStyle(
                                color: Colors.grey.shade600,
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                          if (widget.enableTTS && content.isNotEmpty) ...[
                            const SizedBox(width: 8),
                            GestureDetector(
                              onTap: () {
                                _tts.speak(
                                  text: content,
                                  id: ttsId,
                                  onStart: (id) {
                                    setState(() => _speakingId = id);
                                  },
                                  onDone: (id) {
                                    setState(() => _speakingId = null);
                                  },
                                );
                              },
                              child: Icon(
                                isReading
                                    ? Icons.stop_circle_outlined
                                    : Icons.volume_up_outlined,
                                size: 16,
                                color: isReading
                                    ? const Color(0xFF1877F2)
                                    : Colors.grey.shade500,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
                PopupMenuButton<String>(
                  onSelected: (value) async {
                    if (value == 'edit') {
                      setState(() {
                        _editingCommentId = commentId;
                        _replyToCommentId = null;
                        _replyToName = null;
                      });
                      commentController.text = content;
                      commentController.selection = TextSelection.fromPosition(
                        TextPosition(offset: commentController.text.length),
                      );
                      commentFocusNode.requestFocus();
                    } else if (value == 'delete' && commentId != null) {
                      await _deleteComment(commentId);
                    } else if (value == 'report' && commentId != null) {
                      _openReportCommentDialog(commentId, fullName);
                    }
                  },
                  itemBuilder: (context) {
                    final items = <PopupMenuItem<String>>[];
                    
                    if (isMine) {
                      if (!isDeleted) {
                        items.add(
                          const PopupMenuItem(
                            value: 'edit',
                            child: Text('แก้ไข'),
                          ),
                        );
                      }
                      if (!isDeleted) {
                        items.add(
                          const PopupMenuItem(
                            value: 'delete',
                            child: Text('ลบ'),
                          ),
                        );
                      }
                    } else {
                      items.add(
                        const PopupMenuItem(
                          value: 'report',
                          child: Text('รายงาน'),
                        ),
                      );
                    }
                    
                    return items;
                  },
                ),
              ],
            ),
          ),
          if (children.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Column(
                children: children
                    .map((child) => _buildCommentNode(child, depth + 1, grouped))
                    .toList(),
              ),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final grouped = _groupByParent();
    final roots = grouped[null] ?? const <Map<String, dynamic>>[];

    return Container(
      height: MediaQuery.of(context).size.height * 0.6,
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'ความคิดเห็น',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ),
              IconButton(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
          const Divider(),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : roots.isEmpty
                    ? const Center(child: Text('ไม่มีความคิดเห็น'))
                    : RefreshIndicator(
                        onRefresh: _loadComments,
                        child: ListView(
                          children: roots
                              .map((comment) => _buildCommentNode(comment, 0, grouped))
                              .toList(),
                        ),
                      ),
          ),
          if (_replyToCommentId != null || _editingCommentId != null)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFFEFF4FF),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      _editingCommentId != null
                          ? 'กำลังแก้ไขความคิดเห็น'
                          : 'กำลังตอบกลับ ${_replyToName ?? ''}',
                      style: const TextStyle(fontSize: 12),
                    ),
                  ),
                  GestureDetector(
                    onTap: () {
                      setState(() {
                        _replyToCommentId = null;
                        _replyToName = null;
                        _editingCommentId = null;
                      });
                      commentController.clear();
                    },
                    child: const Icon(Icons.close, size: 18),
                  ),
                ],
              ),
            ),
          StatefulBuilder(
            builder: (ctx, setCommentRow) {
              return Row(
                children: [
                  if (widget.enableSTT)
                    GestureDetector(
                      onTap: () async {
                        if (_isListening) {
                          await _tts.stopListening();
                          setState(() => _isListening = false);
                          setCommentRow(() {});
                        } else {
                          final ok = await _tts.initStt();
                          if (!ok) return;
                          setState(() => _isListening = true);
                          setCommentRow(() {});
                          await _tts.startListening(
                            onResult: (words) {
                              commentController.text = words;
                              commentController.selection =
                                  TextSelection.fromPosition(
                                    TextPosition(offset: words.length),
                                  );
                              setCommentRow(() {});
                            },
                            onDone: () {
                              setState(() => _isListening = false);
                              setCommentRow(() {});
                            },
                          );
                        }
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: _isListening
                                ? Colors.red.withValues(alpha: 0.1)
                                : Colors.transparent,
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            _isListening ? Icons.mic : Icons.mic_none,
                            color: _isListening
                                ? Colors.red
                                : Colors.grey.shade600,
                            size: 22,
                          ),
                        ),
                      ),
                    ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: TextField(
                      focusNode: commentFocusNode,
                      controller: commentController,
                      inputFormatters: [
                        LengthLimitingTextInputFormatter(_maxCommentLength),
                      ],
                      keyboardType: TextInputType.multiline,
                      textInputAction: TextInputAction.newline,
                      maxLines: null,
                      minLines: 1,
                      textCapitalization: TextCapitalization.sentences,
                      enableSuggestions: true,
                      autocorrect: true,
                      enableInteractiveSelection: true,
                      onTap: _stopSttIfListening,
                      onChanged: (_) {
                        if (_isListening) {
                          _stopSttIfListening();
                        }
                      },
                      style: const TextStyle(fontSize: 15, height: 1.35),
                      decoration: InputDecoration(
                        hintText: _isListening
                            ? "กำลังฟังเสียง..."
                            : "เขียนความคิดเห็น...",
                        filled: true,
                        fillColor: Colors.white,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: BorderSide(
                            color: Colors.grey.shade300,
                            width: 1,
                          ),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: BorderSide(
                            color: Colors.grey.shade300,
                            width: 1,
                          ),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(24),
                          borderSide: const BorderSide(
                            color: Color(0xFF1877F2),
                            width: 1.4,
                          ),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 10,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Material(
                    color: const Color(0xFF1877F2),
                    borderRadius: BorderRadius.circular(999),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(999),
                      onTap: _submitComment,
                      child: const Padding(
                        padding: EdgeInsets.all(10),
                        child: Icon(
                          Icons.send_rounded,
                          color: Colors.white,
                          size: 20,
                        ),
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

// ================= REPORT COMMENT DIALOG =================

class _ReportCommentDialog extends StatefulWidget {
  final List<Map<String, dynamic>> reasonsWithIcons;
  final String authorName;
  final Function(String reason, String detail) onSubmit;

  const _ReportCommentDialog({
    required this.reasonsWithIcons,
    required this.authorName,
    required this.onSubmit,
  });

  @override
  State<_ReportCommentDialog> createState() => _ReportCommentDialogState();
}

class _ReportCommentDialogState extends State<_ReportCommentDialog> {
  late String selectedReason;
  late TextEditingController detailController;

  @override
  void initState() {
    super.initState();
    selectedReason = widget.reasonsWithIcons.first["title"];
    detailController = TextEditingController();
  }

  @override
  void dispose() {
    detailController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reasons = widget.reasonsWithIcons
        .map((r) => r["title"] as String)
        .toList();

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 400),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Container(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
              decoration: const BoxDecoration(
                color: Color(0xFFF5F5F5),
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(16),
                  topRight: Radius.circular(16),
                ),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.red.shade100,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.flag,
                      color: Colors.red.shade700,
                      size: 24,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          "รายงานคอมเมนต์",
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          "จาก ${widget.authorName}",
                          style: const TextStyle(fontSize: 12, color: Colors.grey),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            // Content
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    "เหตุผลในการรายงาน",
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey.shade300),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: DropdownButton<String>(
                      isExpanded: true,
                      value: selectedReason,
                      underline: const SizedBox(),
                      onChanged: (value) {
                        if (value != null) {
                          setState(() => selectedReason = value);
                        }
                      },
                      items: reasons
                          .map(
                            (reason) => DropdownMenuItem(
                              value: reason,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 8,
                                  horizontal: 12,
                                ),
                                child: Text(reason),
                              ),
                            ),
                          )
                          .toList(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    "รายละเอียดเพิ่มเติม (ไม่จำเป็น)",
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: detailController,
                    maxLines: 4,
                    minLines: 3,
                    decoration: InputDecoration(
                      hintText: "บอกให้เราทราบรายละเอียด...",
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: const BorderSide(
                          color: Color(0xFF1877F2),
                          width: 2,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton(
                        onPressed: () => Navigator.pop(context, false),
                        child: const Text(
                          "ยกเลิก",
                          style: TextStyle(
                            color: Colors.grey,
                            fontSize: 16,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      ElevatedButton(
                        onPressed: () {
                          widget.onSubmit(
                            selectedReason,
                            detailController.text,
                          );
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.red,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 20,
                            vertical: 12,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        child: const Text(
                          "รายงาน",
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
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
