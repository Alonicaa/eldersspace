import 'dart:async';
import 'package:flutter/material.dart';
import 'services/api_service.dart';
import 'profile_page.dart';
import 'post_detail_page.dart';

class SearchPage extends StatefulWidget {
  final String phoneNumber;

  const SearchPage({super.key, required this.phoneNumber});

  @override
  State<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends State<SearchPage>
    with SingleTickerProviderStateMixin {
  final _controller = TextEditingController();
  Timer? _debounce;
  late final TabController _tabController;

  bool _loading = false;
  bool _searched = false;
  List<dynamic> _users = [];
  List<dynamic> _posts = [];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    _tabController.dispose();
    super.dispose();
  }

  void _onQueryChanged(String value) {
    _debounce?.cancel();
    final q = value.trim();
    if (q.isEmpty) {
      setState(() {
        _searched = false;
        _users = [];
        _posts = [];
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 400), () => _runSearch(q));
  }

  Future<void> _runSearch(String q) async {
    setState(() => _loading = true);
    final result = await ApiService.search(q, phone: widget.phoneNumber);
    if (!mounted) return;
    setState(() {
      _users = result['users'] ?? [];
      _posts = result['posts'] ?? [];
      _loading = false;
      _searched = true;
    });
  }

  Future<void> _openPost(dynamic postId) async {
    final post = await ApiService.getPost(postId, phone: widget.phoneNumber);
    if (!mounted) return;
    if (post == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('ไม่พบโพสต์นี้')),
      );
      return;
    }
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => PostDetailPage(
          post: post,
          currentUserPhone: widget.phoneNumber,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: Colors.black87,
        elevation: 0,
        titleSpacing: 0,
        title: TextField(
          controller: _controller,
          autofocus: true,
          textInputAction: TextInputAction.search,
          onChanged: _onQueryChanged,
          onSubmitted: (v) {
            _debounce?.cancel();
            final q = v.trim();
            if (q.isNotEmpty) _runSearch(q);
          },
          decoration: InputDecoration(
            hintText: 'ค้นหาคนหรือโพสต์...',
            border: InputBorder.none,
            suffixIcon: _controller.text.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.clear),
                    onPressed: () {
                      _controller.clear();
                      _onQueryChanged('');
                    },
                  )
                : null,
          ),
        ),
        bottom: TabBar(
          controller: _tabController,
          labelColor: const Color(0xFF1565C0),
          unselectedLabelColor: Colors.grey,
          indicatorColor: const Color(0xFF1565C0),
          tabs: const [
            Tab(text: 'คน'),
            Tab(text: 'โพสต์'),
          ],
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : !_searched
              ? const Center(child: Text('พิมพ์เพื่อค้นหาคนหรือโพสต์'))
              : TabBarView(
                  controller: _tabController,
                  children: [
                    _buildUserResults(),
                    _buildPostResults(),
                  ],
                ),
    );
  }

  Widget _buildUserResults() {
    if (_users.isEmpty) {
      return const Center(child: Text('ไม่พบผู้ใช้ที่ตรงกัน'));
    }
    return ListView.builder(
      itemCount: _users.length,
      itemBuilder: (context, index) {
        final user = _users[index];
        final avatarUrl = user['profile_picture_url'] as String?;
        return ListTile(
          leading: CircleAvatar(
            backgroundImage: (avatarUrl != null && avatarUrl.isNotEmpty)
                ? NetworkImage(avatarUrl)
                : null,
            child: (avatarUrl == null || avatarUrl.isEmpty)
                ? const Icon(Icons.person)
                : null,
          ),
          title: Text(
            user['full_name']?.toString() ?? '',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          onTap: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => ProfilePage(
                  phoneNumber: user['phone_number'].toString(),
                  currentUserPhone: widget.phoneNumber,
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildPostResults() {
    if (_posts.isEmpty) {
      return const Center(child: Text('ไม่พบโพสต์ที่ตรงกัน'));
    }
    return ListView.builder(
      itemCount: _posts.length,
      itemBuilder: (context, index) {
        final post = _posts[index];
        final avatarUrl = post['profile_picture_url'] as String?;
        return ListTile(
          leading: CircleAvatar(
            backgroundImage: (avatarUrl != null && avatarUrl.isNotEmpty)
                ? NetworkImage(avatarUrl)
                : null,
            child: (avatarUrl == null || avatarUrl.isEmpty)
                ? const Icon(Icons.person)
                : null,
          ),
          title: Text(
            post['full_name']?.toString() ?? '',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          subtitle: Text(
            post['content']?.toString() ?? '',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          onTap: () => _openPost(post['post_id']),
        );
      },
    );
  }
}
