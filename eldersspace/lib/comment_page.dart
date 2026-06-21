import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'services/api_service.dart';
import 'widgets/share_sheet.dart';

class CommunityPage extends StatefulWidget {
  final String phoneNumber;

  const CommunityPage({super.key, required this.phoneNumber});

  @override
  State<CommunityPage> createState() => _CommunityPageState();
}

class _CommunityPageState extends State<CommunityPage> {
  List posts = [];
  bool loading = true;

  List<File> selectedImages = [];
  String? _myAvatarUrl;
  String? _myName;

  final TextEditingController postController = TextEditingController();

  final String baseUrl = "http://10.0.2.2:3000/api";

  @override
  void initState() {
    super.initState();
    _loadMyProfile();
    loadPosts();
  }

  Future<void> _loadMyProfile() async {
    try {
      final name = await ApiService.getUserName(widget.phoneNumber);
      final avatar = await ApiService.getProfilePictureUrl(widget.phoneNumber);
      if (!mounted) return;
      setState(() {
        _myName = name;
        _myAvatarUrl = avatar;
      });
    } catch (_) {}
  }

  Future loadPosts() async {
    final res = await http.get(Uri.parse("$baseUrl/posts"));

    if (res.statusCode == 200) {
      setState(() {
        posts = jsonDecode(res.body);
        loading = false;
      });
    }
  }

  Future pickImages() async {
    final picker = ImagePicker();

    final picked = await picker.pickMultiImage(imageQuality: 85);

    if (picked.isNotEmpty) {
      setState(() {
        selectedImages.addAll(picked.map((x) => File(x.path)));
      });
    }
  }

  Future createPost() async {
    if (postController.text.isEmpty && selectedImages.isEmpty) return;

    var request = http.MultipartRequest("POST", Uri.parse("$baseUrl/posts"));

    request.fields["phone"] = widget.phoneNumber;
    request.fields["content"] = postController.text;

    for (final image in selectedImages) {
      request.files.add(
        await http.MultipartFile.fromPath("images", image.path),
      );
    }

    await request.send();

    postController.clear();
    selectedImages.clear();

    loadPosts();
  }

  Future likePost(int postId, String type) async {
    await http.post(
      Uri.parse("$baseUrl/posts/$postId/like"),
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"phone": widget.phoneNumber, "type": type}),
    );

    loadPosts();
  }

  Widget postCard(var p) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(child: Text(p["full_name"][0].toUpperCase())),

                const SizedBox(width: 10),

                Text(
                  p["full_name"],
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ],
            ),

            const SizedBox(height: 10),

            Text(p["content"] ?? ""),

            if ((p["images"] ?? []).isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: SizedBox(
                  height: 120,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: (p["images"] as List).length,
                    separatorBuilder: (_, __) => const SizedBox(width: 8),
                    itemBuilder: (_, i) {
                      final imgUrl = (p["images"] as List)[i].toString();
                      return ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: Image.network(
                          imgUrl,
                          width: 120,
                          height: 120,
                          fit: BoxFit.cover,
                        ),
                      );
                    },
                  ),
                ),
              )
            else if (p["image_url"] != null)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Image.network(
                    '${ApiService.baseUrl.replaceFirst('/api', '')}/uploads/${p["image_url"]}',
                  ),
                ),
              ),

            const SizedBox(height: 10),

            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                Text("👍 ${p["likes"] ?? 0}"),
                Text("💬 ${p["comments"] ?? 0}"),
                Text("👁 ${p["views"] ?? 0}"),
              ],
            ),

            const Divider(),

            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                TextButton.icon(
                  onPressed: () {
                    likePost(p["post_id"], "like");
                  },
                  icon: const Icon(Icons.thumb_up),
                  label: const Text("Like"),
                ),

                TextButton.icon(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => CommentPage(
                          postId: p["post_id"],
                          phone: widget.phoneNumber,
                        ),
                      ),
                    );
                  },
                  icon: const Icon(Icons.comment),
                  label: const Text("Comment"),
                ),

                TextButton.icon(
                  onPressed: () => _openShareSheet(p),
                  icon: const Icon(Icons.share),
                  label: const Text("Share"),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget createPostBox() {
    return Card(
      margin: const EdgeInsets.all(10),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleAvatar(
                  radius: 18,
                  backgroundColor: const Color(0xFF3B6FD4),
                  backgroundImage: _myAvatarUrl != null
                      ? NetworkImage(_myAvatarUrl!)
                      : null,
                  child: _myAvatarUrl == null
                      ? Text(
                          (_myName ?? widget.phoneNumber).isNotEmpty
                              ? (_myName ?? widget.phoneNumber)[0].toUpperCase()
                              : '?',
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                          ),
                        )
                      : null,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    controller: postController,
                    keyboardType: TextInputType.multiline,
                    maxLines: null,
                    decoration: InputDecoration(
                      hintText: "คุณกำลังคิดอะไรอยู่?",
                      filled: true,
                      fillColor: Colors.grey.shade100,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(20),
                        borderSide: BorderSide(color: Colors.grey.shade300),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(20),
                        borderSide: BorderSide(color: Colors.grey.shade300),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 12,
                      ),
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 10),

            if (selectedImages.isNotEmpty)
              SizedBox(
                height: 120,
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  itemCount: selectedImages.length,
                  itemBuilder: (_, i) {
                    return Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: Stack(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(10),
                            child: Image.file(
                              selectedImages[i],
                              width: 120,
                              height: 120,
                              fit: BoxFit.cover,
                            ),
                          ),
                          Positioned(
                            top: 4,
                            right: 4,
                            child: GestureDetector(
                              onTap: () =>
                                  setState(() => selectedImages.removeAt(i)),
                              child: Container(
                                decoration: const BoxDecoration(
                                  color: Colors.black54,
                                  shape: BoxShape.circle,
                                ),
                                padding: const EdgeInsets.all(4),
                                child: const Icon(
                                  Icons.close,
                                  color: Colors.white,
                                  size: 14,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),

            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                IconButton(
                  icon: const Icon(Icons.image),
                  onPressed: pickImages,
                ),

                ElevatedButton(
                  onPressed: createPost,
                  child: const Text("โพสต์"),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Community")),

      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: loadPosts,

              child: ListView(
                children: [
                  createPostBox(),

                  ...posts.map((p) => postCard(p)).toList(),
                ],
              ),
            ),
    );
  }

  void _openShareSheet(Map p) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => ShareSheet(
        post: p,
        currentUserPhone: widget.phoneNumber,
        baseUrl: baseUrl,
        myName: _myName,
        myAvatarUrl: _myAvatarUrl,
        onShareInApp: () => _openSharePopup(p),
      ),
    );
  }

  void _openSharePopup(Map originalPost) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => SharePostSheet(
        post: originalPost,
        currentUserPhone: widget.phoneNumber,
        baseUrl: baseUrl,
        myName: _myName,
        myAvatarUrl: _myAvatarUrl,
        onShareComplete: loadPosts,
      ),
    );
  }
}

class CommentPage extends StatefulWidget {
  final int postId;
  final String phone;

  const CommentPage({super.key, required this.postId, required this.phone});

  @override
  State<CommentPage> createState() => _CommentPageState();
}

class _CommentPageState extends State<CommentPage> {
  List comments = [];

  final controller = TextEditingController();

  final String baseUrl = "http://10.0.2.2:3000/api";

  @override
  void initState() {
    super.initState();
    loadComments();
  }

  Future loadComments() async {
    final res = await http.get(Uri.parse("$baseUrl/comments/${widget.postId}"));

    setState(() {
      comments = jsonDecode(res.body);
    });
  }

  Future addComment() async {
    await http.post(
      Uri.parse("$baseUrl/posts/${widget.postId}/comment"),
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"phone": widget.phone, "content": controller.text}),
    );

    controller.clear();
    loadComments();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Comments")),

      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              itemCount: comments.length,

              itemBuilder: (context, i) {
                var c = comments[i];

                return ListTile(
                  leading: CircleAvatar(child: Text(c["full_name"][0])),
                  title: Text(c["full_name"]),
                  subtitle: Text(c["content"]),
                );
              },
            ),
          ),

          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  decoration: const InputDecoration(
                    hintText: "เขียนความคิดเห็น...",
                  ),
                ),
              ),

              IconButton(icon: const Icon(Icons.send), onPressed: addComment),
            ],
          ),
        ],
      ),
    );
  }
}
