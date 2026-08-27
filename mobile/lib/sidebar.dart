import 'package:flutter/material.dart';

class AppSidebar extends StatelessWidget {
  final int currentTab;
  final bool isAdmin;
  final Function(int) onTabSelected;

  const AppSidebar({
    super.key,
    required this.currentTab,
    required this.isAdmin,
    required this.onTabSelected,
  });

  @override
  Widget build(BuildContext context) {
    return Drawer(
      backgroundColor: const Color(0xFF1a1a2e),
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          DrawerHeader(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [Color(0xFF667eea), Color(0xFF764ba2)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Text('🌐 LingoLink AI', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                const SizedBox(height: 5),
                const Text('Enterprise AI Translation', style: TextStyle(color: Colors.white70, fontSize: 12)),
                const SizedBox(height: 10),
                IconButton(
                  icon: const Icon(Icons.close, color: Colors.white),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
          _buildNavItem(context, Icons.translate, 'Translate', 0),
          _buildNavItem(context, Icons.history, 'History', 1),
          _buildNavItem(context, Icons.call, 'Call Center', 2),
          _buildNavItem(context, Icons.record_voice_over, 'PTT Mode', 3),
          _buildNavItem(context, Icons.video_library, 'Video Studio', 4),
          if (isAdmin) _buildNavItem(context, Icons.admin_panel_settings, 'Admin Dashboard', 5),
          const Divider(color: Colors.white24),
          ListTile(
            leading: const Icon(Icons.logout, color: Colors.red),
            title: const Text('Logout', style: TextStyle(color: Colors.red)),
            onTap: () {
              Navigator.pop(context);
              // Navigate to login
              Navigator.pushReplacement(
                context,
                MaterialPageRoute(builder: (context) => const _LoginPlaceholder()),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildNavItem(BuildContext context, IconData icon, String label, int index) {
    final isActive = currentTab == index;
    return ListTile(
      leading: Icon(icon, color: isActive ? Colors.blue : Colors.white),
      title: Text(
        label,
        style: TextStyle(
          color: isActive ? Colors.blue : Colors.white,
          fontWeight: isActive ? FontWeight.bold : FontWeight.normal,
        ),
      ),
      tileColor: isActive ? Colors.blue.withOpacity(0.1) : Colors.transparent,
      onTap: () {
        Navigator.pop(context);
        onTabSelected(index);
      },
    );
  }
}

class _LoginPlaceholder extends StatelessWidget {
  const _LoginPlaceholder();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Text('Logged out', style: TextStyle(color: Colors.white)),
      ),
    );
  }
}