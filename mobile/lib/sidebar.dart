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
      width: MediaQuery.of(context).size.width * 0.75,
      child: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF1a1a2e), Color(0xFF0f0c29)],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              // Sidebar Header
              Container(
                padding: const EdgeInsets.all(20),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(colors: [Color(0xFF667eea), Color(0xFF764ba2)]),
                  borderRadius: BorderRadius.only(bottomRight: Radius.circular(30)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.2),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.translate, color: Colors.white, size: 30),
                        ),
                        const SizedBox(width: 15),
                        const Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '🌐 LingoLink AI',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            Text(
                              'Enterprise Translation',
                              style: TextStyle(color: Colors.white70, fontSize: 12),
                            ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    // Quick stats
                    Row(
                      children: [
                        _buildQuickStat(Icons.language, '50+', 'Languages'),
                        const SizedBox(width: 10),
                        _buildQuickStat(Icons.speed, 'Fast', 'AI Powered'),
                        const SizedBox(width: 10),
                        _buildQuickStat(Icons.security, 'Secure', 'Encrypted'),
                      ],
                    ),
                  ],
                ),
              ),

              // Navigation Items
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 5),
                  children: [
                    _buildSectionTitle('MAIN FEATURES'),
                    _buildNavItem(context, 0, Icons.translate, 'Translate', 'Text & voice translation'),
                    _buildNavItem(context, 1, Icons.history, 'History', 'Past translations'),
                    _buildNavItem(context, 2, Icons.call, 'Call Center', 'Live call translation'),
                    _buildNavItem(context, 3, Icons.mic, 'Push-to-Talk', 'Two-way conversation'),
                    _buildNavItem(context, 4, Icons.video_library, 'Video Studio', 'Video subtitles'),

                    const SizedBox(height: 10),
                    _buildSectionTitle('TOOLS'),
                    _buildNavItem(context, 6, Icons.record_voice_over, 'Voice Translation', 'Speech to speech'),
                    _buildNavItem(context, 7, Icons.subtitles, 'Live Subtitles', 'Real-time captions'),
                    _buildNavItem(context, 8, Icons.offline_bolt, 'Offline Mode', 'Work without internet'),

                    if (isAdmin) ...[
                      const SizedBox(height: 10),
                      _buildSectionTitle('ADMINISTRATION'),
                      _buildNavItem(context, 5, Icons.admin_panel_settings, 'Admin Dashboard', 'Manage users & analytics'),
                      _buildNavItem(context, 9, Icons.people, 'User Management', 'Add/remove users'),
                      _buildNavItem(context, 10, Icons.analytics, 'Analytics', 'Usage statistics'),
                    ],

                    const SizedBox(height: 10),
                    _buildSectionTitle('SUPPORT'),
                    _buildNavItem(context, 11, Icons.help, 'Help Center', 'FAQs & guides'),
                    _buildNavItem(context, 12, Icons.settings, 'Settings', 'App preferences'),
                    _buildNavItem(context, 13, Icons.info, 'About', 'Version info'),
                  ],
                ),
              ),

              // Sidebar Footer
              Container(
                padding: const EdgeInsets.all(15),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.05),
                  border: Border(top: BorderSide(color: Colors.white.withOpacity(0.1))),
                ),
                child: Column(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 8),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(colors: [Color(0xFF667eea), Color(0xFF764ba2)]),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.shield, color: Colors.white, size: 14),
                          SizedBox(width: 5),
                          Text(
                            'Secure & Encrypted',
                            style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '© 2026 LingoLink AI\nEnterprise AI Translation Platform',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.grey.withOpacity(0.7), fontSize: 10),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 8),
      child: Text(
        title,
        style: TextStyle(
          color: Colors.grey[500],
          fontSize: 10,
          fontWeight: FontWeight.bold,
          letterSpacing: 1.5,
        ),
      ),
    );
  }

  Widget _buildQuickStat(IconData icon, String value, String label) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.1),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          children: [
            Icon(icon, color: Colors.white, size: 16),
            const SizedBox(height: 3),
            Text(value, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
            Text(label, style: const TextStyle(color: Colors.white70, fontSize: 8)),
          ],
        ),
      ),
    );
  }

  Widget _buildNavItem(BuildContext context, int index, IconData icon, String title, String subtitle) {
    final isSelected = currentTab == index;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        decoration: BoxDecoration(
          gradient: isSelected
              ? const LinearGradient(colors: [Color(0xFF667eea), Color(0xFF764ba2)])
              : null,
          color: isSelected ? null : Colors.transparent,
          borderRadius: BorderRadius.circular(15),
          boxShadow: isSelected
              ? [BoxShadow(color: const Color(0xFF667eea).withOpacity(0.3), blurRadius: 8, offset: const Offset(0, 3))]
              : null,
        ),
        child: ListTile(
          dense: true,
          leading: Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: isSelected ? Colors.white.withOpacity(0.2) : Colors.white.withOpacity(0.05),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: isSelected ? Colors.white : const Color(0xFF667eea), size: 18),
          ),
          title: Text(
            title,
            style: TextStyle(
              color: isSelected ? Colors.white : Colors.grey[300],
              fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
              fontSize: 13,
            ),
          ),
          subtitle: Text(
            subtitle,
            style: TextStyle(
              color: isSelected ? Colors.white70 : Colors.grey[600],
              fontSize: 9,
            ),
          ),
          trailing: isSelected
              ? const Icon(Icons.chevron_right, color: Colors.white, size: 18)
              : Icon(Icons.chevron_right, color: Colors.grey[700], size: 18),
          onTap: () {
            onTabSelected(index);
            Navigator.pop(context);
          },
        ),
      ),
    );
  }
}