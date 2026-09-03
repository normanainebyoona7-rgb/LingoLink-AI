import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'dart:typed_data';
import 'package:audioplayers/audioplayers.dart';
import 'package:permission_handler/permission_handler.dart';
import 'sidebar.dart';
import 'header.dart';
import 'footer.dart';
import 'landing_page.dart';

class HomeScreen extends StatefulWidget {
  final String token;
  final String username;
  final bool isPremium;
  final bool isAdmin;

  const HomeScreen({
    super.key,
    required this.token,
    required this.username,
    required this.isPremium,
    this.isAdmin = false,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final TextEditingController _textController = TextEditingController();
  final TextEditingController _sourceSearchController = TextEditingController();
  final TextEditingController _targetSearchController = TextEditingController();
  final AudioPlayer _player = AudioPlayer();

  String _translatedText = '';
  String _sourceLanguage = 'english';
  String _targetLanguage = 'spanish';
  String _sourceSearch = '';
  String _targetSearch = '';
  bool _isLoading = false;
  bool _isRecording = false;
  bool _isPremium = false;
  int _currentTab = 0;
  List<dynamic> _history = [];
  List<dynamic> _callQueue = [];
  String? _activeCall;
  List<Map<String, String>> _transcript = [];
  String _subtitleLanguage = 'luganda';
  List<String> _liveSubtitles = [];
  Map<String, dynamic>? _adminDashboard;
  List<dynamic> _adminUsers = [];
  bool _isPttMode = false;
  bool _isListening = false;
  String _speakerA = 'english';
  String _speakerB = 'luganda';
  bool _isSpeakerATurn = true;
  bool _isOfflineMode = false;

  final List<Map<String, String>> _languages = [
    {'code': 'english', 'name': 'English'},
    {'code': 'spanish', 'name': 'Spanish'},
    {'code': 'french', 'name': 'French'},
    {'code': 'german', 'name': 'German'},
    {'code': 'portuguese', 'name': 'Portuguese'},
    {'code': 'italian', 'name': 'Italian'},
    {'code': 'dutch', 'name': 'Dutch'},
    {'code': 'russian', 'name': 'Russian'},
    {'code': 'arabic', 'name': 'Arabic'},
    {'code': 'hindi', 'name': 'Hindi'},
    {'code': 'chinese', 'name': 'Chinese'},
    {'code': 'japanese', 'name': 'Japanese'},
    {'code': 'korean', 'name': 'Korean'},
    {'code': 'turkish', 'name': 'Turkish'},
    {'code': 'luganda', 'name': 'Luganda'},
    {'code': 'rukiga', 'name': 'Rukiga'},
    {'code': 'runyankole', 'name': 'Runyankole'},
    {'code': 'acholi', 'name': 'Acholi'},
    {'code': 'alur', 'name': 'Alur'},
    {'code': 'ateso', 'name': 'Ateso'},
    {'code': 'lango', 'name': 'Lango'},
    {'code': 'lugbara', 'name': 'Lugbara'},
    {'code': 'lusoga', 'name': 'Lusoga'},
    {'code': 'lugwere', 'name': 'Lugwere'},
    {'code': 'swahili', 'name': 'Swahili'},
    {'code': 'kinyarwanda', 'name': 'Kinyarwanda'},
    {'code': 'kirundi', 'name': 'Kirundi'},
    {'code': 'amharic', 'name': 'Amharic'},
    {'code': 'somali', 'name': 'Somali'},
    {'code': 'oromo', 'name': 'Oromo'},
    {'code': 'tigrinya', 'name': 'Tigrinya'},
    {'code': 'kikuyu', 'name': 'Kikuyu'},
    {'code': 'dholuo', 'name': 'Dholuo'},
    {'code': 'yoruba', 'name': 'Yoruba'},
    {'code': 'hausa', 'name': 'Hausa'},
    {'code': 'igbo', 'name': 'Igbo'},
    {'code': 'fulfulde', 'name': 'Fulfulde'},
    {'code': 'wolof', 'name': 'Wolof'},
    {'code': 'bambara', 'name': 'Bambara'},
    {'code': 'twi', 'name': 'Twi'},
    {'code': 'ewe', 'name': 'Ewe'},
    {'code': 'lingala', 'name': 'Lingala'},
    {'code': 'kikongo', 'name': 'Kikongo'},
    {'code': 'bemba', 'name': 'Bemba'},
    {'code': 'chichewa', 'name': 'Chichewa'},
    {'code': 'zulu', 'name': 'Zulu'},
    {'code': 'xhosa', 'name': 'Xhosa'},
    {'code': 'afrikaans', 'name': 'Afrikaans'},
    {'code': 'sesotho', 'name': 'Sesotho'},
    {'code': 'setswana', 'name': 'Setswana'},
    {'code': 'shona', 'name': 'Shona'},
    {'code': 'kabyle', 'name': 'Kabyle'},
    {'code': 'tachelhit', 'name': 'Tachelhit'},
  ];

  @override
  void initState() {
    super.initState();
    _isPremium = widget.isPremium;
  }

  List<Map<String, String>> _filterLanguages(String search) {
    if (search.isEmpty) return _languages;
    return _languages.where((lang) =>
      lang['name']!.toLowerCase().contains(search.toLowerCase()) ||
      lang['code']!.toLowerCase().contains(search.toLowerCase())
    ).toList();
  }

  Future<void> _requestPermissions() async {
    await Permission.microphone.request();
  }

  Future<void> _loadOfflineModels() async {
    setState(() => _isOfflineMode = true);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('✅ Offline mode enabled!')),
    );
  }

  Future<void> _translateText() async {
    if (_textController.text.isEmpty) return;
    if (_isOfflineMode) {
      final result = await _offlineTranslate(_textController.text, _sourceLanguage, _targetLanguage);
      setState(() => _translatedText = result);
      return;
    }
    setState(() { _isLoading = true; _translatedText = ''; });
    try {
      final response = await http.post(
        Uri.parse('http://192.168.1.2:8000/translate/text'),
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ${widget.token}'},
        body: jsonEncode({
          'text': _textController.text,
          'source_language': _sourceLanguage,
          'target_language': _targetLanguage,
          'user_id': 1,
        }),
      );
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        setState(() { _translatedText = data['translated_text']; });
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Translation error: $e')),
      );
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<String> _offlineTranslate(String text, String sourceLang, String targetLang) async {
    final offlineDict = {
      'english_luganda': {'good morning': 'wasuze otya', 'thank you': 'webale', 'hello': 'ki kati'},
      'english_swahili': {'good morning': 'habari za asubuhi', 'thank you': 'asante', 'hello': 'jambo'},
    };
    final key = '${sourceLang}_$targetLang';
    final textLower = text.toLowerCase();
    if (offlineDict.containsKey(key)) {
      for (var entry in offlineDict[key]!.entries) {
        if (textLower.contains(entry.key)) return entry.value;
      }
    }
    return text;
  }

  Future<void> _fetchHistory() async {
    try {
      final response = await http.get(
        Uri.parse('http://192.168.1.2:8000/translate/history'),
        headers: {'Authorization': 'Bearer ${widget.token}'},
      );
      if (response.statusCode == 200) {
        setState(() { _history = jsonDecode(response.body); });
      }
    } catch (e) {}
  }

  Future<void> _fetchAdminDashboard() async {
    try {
      final response = await http.get(
        Uri.parse('http://192.168.1.2:8000/admin/dashboard'),
        headers: {'Authorization': 'Bearer ${widget.token}'},
      );
      if (response.statusCode == 200) {
        setState(() { _adminDashboard = jsonDecode(response.body); });
      }
    } catch (e) {}
    try {
      final response = await http.get(
        Uri.parse('http://192.168.1.2:8000/admin/users'),
        headers: {'Authorization': 'Bearer ${widget.token}'},
      );
      if (response.statusCode == 200) {
        setState(() { _adminUsers = jsonDecode(response.body); });
      }
    } catch (e) {}
  }

  Future<void> _startRecording() async {
    setState(() => _isRecording = true);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('🎤 Recording started (demo mode)')),
    );
  }

  Future<void> _stopRecording() async {
    setState(() => _isRecording = false);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('🎤 Recording stopped (demo mode)')),
    );
  }

  Future<void> _speakTranslation() async {
    if (_translatedText.isEmpty) return;
    try {
      final response = await http.post(
        Uri.parse('http://192.168.1.2:8000/tts/speak?text=${Uri.encodeComponent(_translatedText)}&language=$_targetLanguage&voice=female'),
      );
      if (response.statusCode == 200) {
        await _player.play(BytesSource(response.bodyBytes));
      }
    } catch (e) {}
  }

  void _simulateIncomingCall() {
    final languages = ['Luganda', 'Swahili', 'Acholi', 'English'];
    final randomLang = languages[DateTime.now().millisecondsSinceEpoch % languages.length];
    setState(() {
      _callQueue.add({'caller': 'Caller ${_callQueue.length + 1}', 'language': randomLang});
    });
  }

  void _acceptCall(int index) {
    setState(() {
      _activeCall = _callQueue[index]['caller'];
      _callQueue.removeAt(index);
      _transcript = [
        {'speaker': 'Caller', 'text': 'Good morning, I need help', 'language': 'Luganda'},
        {'speaker': 'Agent', 'text': 'Good morning! How can I assist?', 'language': 'English'},
      ];
    });
  }

  void _endCall() => setState(() { _activeCall = null; _transcript = []; });

  Future<void> _startPtt() async {
    await _requestPermissions();
    setState(() { _isPttMode = true; _isListening = true; });
    await _startRecording();
  }

  Future<void> _stopPtt() async {
    setState(() { _isListening = false; });
    await _stopRecording();
  }

  void _switchSpeaker() {
    setState(() {
      _isSpeakerATurn = !_isSpeakerATurn;
      _sourceLanguage = _isSpeakerATurn ? _speakerA : _speakerB;
      _targetLanguage = _isSpeakerATurn ? _speakerB : _speakerA;
      _translatedText = '';
      _textController.clear();
    });
  }

  @override
  void dispose() {
    _textController.dispose();
    _sourceSearchController.dispose();
    _targetSearchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: _scaffoldKey,
      appBar: AppHeader(
        title: 'LingoLink AI',
        subtitle: 'Enterprise Translation Platform',
        username: widget.username,
        isPremium: _isPremium,
        onLogout: () => Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (context) => const LandingPage()),
        ),
        onMenuTap: () => _scaffoldKey.currentState?.openDrawer(),
      ),
      drawer: AppSidebar(
        currentTab: _currentTab,
        isAdmin: widget.isAdmin,
        onTabSelected: (index) {
          setState(() => _currentTab = index);
          if (index == 1) _fetchHistory();
          if (index == 5) _fetchAdminDashboard();
        },
      ),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 300),
        child: Column(
          key: ValueKey(_currentTab),
          children: [
            Expanded(child: _buildMainContent()),
            const AppFooter(),
          ],
        ),
      ),
    );
  }

  Widget _buildMainContent() {
    switch (_currentTab) {
      case 0: return _buildTranslateTab();
      case 1: return _buildHistoryTab();
      case 2: return _buildCallCenterTab();
      case 3: return _buildPttTab();
      case 4: return _buildVideoTab();
      case 5: return _buildAdminTab();
      case 6: return _buildVoiceTranslationTab();
      case 7: return _buildLiveSubtitlesTab();
      case 8: return _buildOfflineModeTab();
      case 9: return _buildUserManagementTab();
      case 10: return _buildAnalyticsTab();
      case 11: return _buildHelpCenterTab();
      case 12: return _buildSettingsTab();
      case 13: return _buildAboutTab();
      default: return _buildTranslateTab();
    }
  }

  Widget _buildTranslateTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(15),
              child: Row(
                children: [
                  const Icon(Icons.offline_bolt, color: Color(0xFF667eea)),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text('📡 Offline Mode', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  ),
                  Switch(
                    value: _isOfflineMode,
                    onChanged: (value) async {
                      if (value) await _loadOfflineModels();
                      else setState(() => _isOfflineMode = false);
                    },
                    activeColor: const Color(0xFF667eea),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 15),
          _buildLanguageSelector('From', _sourceLanguage, (value) {
            setState(() { _sourceLanguage = value; _sourceSearch = ''; });
          }),
          const SizedBox(height: 10),
          const Center(child: Icon(Icons.arrow_downward_rounded, color: Color(0xFF667eea), size: 25)),
          const SizedBox(height: 10),
          _buildLanguageSelector('To', _targetLanguage, (value) {
            setState(() { _targetLanguage = value; _targetSearch = ''; });
          }),
          const SizedBox(height: 20),
          TextField(
            controller: _textController,
            maxLines: 4,
            style: const TextStyle(color: Colors.white, fontSize: 16),
            decoration: InputDecoration(
              hintText: 'Enter text to translate...',
              hintStyle: const TextStyle(color: Colors.grey),
              prefixIcon: const Icon(Icons.edit, color: Color(0xFF667eea)),
            ),
          ),
          const SizedBox(height: 15),
          Container(
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Color(0xFF667eea), Color(0xFF764ba2)]),
              borderRadius: BorderRadius.circular(15),
              boxShadow: const [BoxShadow(color: Color(0xFF667eea), blurRadius: 10, offset: Offset(0, 3))],
            ),
            child: ElevatedButton.icon(
              onPressed: _isLoading ? null : _translateText,
              icon: _isLoading ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)) : const Icon(Icons.translate, color: Colors.white),
              label: Text(_isLoading ? 'Translating...' : 'Translate', style: const TextStyle(color: Colors.white, fontSize: 18)),
              style: ElevatedButton.styleFrom(backgroundColor: Colors.transparent, shadowColor: Colors.transparent, padding: const EdgeInsets.symmetric(vertical: 15)),
            ),
          ),
          if (_translatedText.isNotEmpty) ...[
            const SizedBox(height: 20),
            Card(
              elevation: 10,
              shadowColor: Colors.green.withOpacity(0.3),
              child: Padding(
                padding: const EdgeInsets.all(20.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.check_circle, color: Colors.green),
                        SizedBox(width: 10),
                        Text('Translation:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: Colors.white)),
                      ],
                    ),
                    const SizedBox(height: 15),
                    Text(_translatedText, style: const TextStyle(fontSize: 22, color: Colors.white, height: 1.4)),
                    const SizedBox(height: 15),
                    Center(
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(colors: [Colors.green, Colors.teal]),
                          borderRadius: BorderRadius.circular(15),
                        ),
                        child: ElevatedButton.icon(
                          onPressed: _speakTranslation,
                          icon: const Icon(Icons.volume_up, color: Colors.white),
                          label: const Text('Hear Translation', style: TextStyle(color: Colors.white)),
                          style: ElevatedButton.styleFrom(backgroundColor: Colors.transparent, shadowColor: Colors.transparent, padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 20)),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildLanguageSelector(String label, String selectedValue, Function(String) onSelected) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                value: selectedValue,
                dropdownColor: const Color(0xFF1a1a2e),
                style: const TextStyle(color: Colors.white, fontSize: 14),
                decoration: InputDecoration(
                  labelText: '$label Language',
                  labelStyle: const TextStyle(color: Colors.grey, fontSize: 12),
                  prefixIcon: Icon(label == 'From' ? Icons.translate : Icons.g_translate, color: const Color(0xFF667eea)),
                ),
                items: _languages.map((lang) => DropdownMenuItem(
                  value: lang['code'],
                  child: Text('${lang['name']} (${lang['code']})', overflow: TextOverflow.ellipsis),
                )).toList(),
                onChanged: (value) => onSelected(value!),
              ),
            ),
            const SizedBox(width: 5),
            IconButton(
              icon: const Icon(Icons.search, color: Color(0xFF667eea)),
              onPressed: () => _showLanguageSearch(label, onSelected),
            ),
          ],
        ),
      ),
    );
  }

  void _showLanguageSearch(String label, Function(String) onSelected) {
    String search = '';
    showDialog(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF1a1a2e),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(25)),
          title: Text('Search $label Language', style: const TextStyle(color: Colors.white)),
          content: SizedBox(
            width: 300,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  autofocus: true,
                  style: const TextStyle(color: Colors.white),
                  decoration: const InputDecoration(
                    hintText: 'Type language...',
                    hintStyle: TextStyle(color: Colors.grey),
                    prefixIcon: Icon(Icons.search, color: Color(0xFF667eea)),
                  ),
                  onChanged: (value) {
                    search = value;
                    setDialogState(() {});
                  },
                ),
                const SizedBox(height: 15),
                SizedBox(
                  height: 300,
                  child: ListView(
                    shrinkWrap: true,
                    children: _filterLanguages(search).map((lang) => ListTile(
                      leading: const Icon(Icons.language, color: Color(0xFF667eea)),
                      title: Text(lang['name']!, style: const TextStyle(color: Colors.white)),
                      subtitle: Text(lang['code']!, style: const TextStyle(color: Colors.grey, fontSize: 11)),
                      onTap: () {
                        onSelected(lang['code']!);
                        Navigator.pop(dialogContext);
                      },
                    )).toList(),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel', style: TextStyle(color: Colors.grey))),
          ],
        ),
      ),
    );
  }

  Widget _buildHistoryTab() {
    return _history.isEmpty
        ? const Center(child: Text('No translations yet.', style: TextStyle(color: Colors.grey)))
        : ListView.builder(
            padding: const EdgeInsets.all(15.0),
            itemCount: _history.length,
            itemBuilder: (context, index) {
              final item = _history[index];
              return Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: ListTile(
                  leading: const Icon(Icons.history, color: Color(0xFF667eea)),
                  title: Text(item['source_text'] ?? '', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  subtitle: Text(item['translated_text'] ?? '', style: const TextStyle(color: Color(0xFF667eea))),
                ),
              );
            },
          );
  }

  Widget _buildCallCenterTab() {
    return Padding(
      padding: const EdgeInsets.all(20.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('📞 Call Center', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white)),
          const SizedBox(height: 20),
          Container(
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Colors.orange, Colors.deepOrange]),
              borderRadius: BorderRadius.circular(15),
            ),
            child: ElevatedButton.icon(
              onPressed: _simulateIncomingCall,
              icon: const Icon(Icons.call_received, color: Colors.white),
              label: const Text('Simulate Incoming Call', style: TextStyle(color: Colors.white)),
              style: ElevatedButton.styleFrom(backgroundColor: Colors.transparent, shadowColor: Colors.transparent, padding: const EdgeInsets.symmetric(vertical: 15)),
            ),
          ),
          const SizedBox(height: 20),
          const Text('📋 Call Queue', style: TextStyle(fontSize: 18, color: Colors.white, fontWeight: FontWeight.bold)),
          if (_callQueue.isEmpty)
            const Text('Queue empty', style: TextStyle(color: Colors.grey))
          else
            ..._callQueue.asMap().entries.map((entry) {
              return Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: const Icon(Icons.person, color: Color(0xFF667eea)),
                  title: Text(entry.value['caller'] ?? '', style: const TextStyle(color: Colors.white)),
                  subtitle: Text(entry.value['language'] ?? '', style: const TextStyle(color: Colors.grey)),
                  trailing: ElevatedButton(
                    onPressed: () => _acceptCall(entry.key),
                    style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
                    child: const Text('Accept'),
                  ),
                ),
              );
            }).toList(),
          if (_activeCall != null) ...[
            const SizedBox(height: 20),
            Text('💬 Active Call: $_activeCall', style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            ..._transcript.map((line) => Card(
              margin: const EdgeInsets.only(bottom: 5),
              child: ListTile(
                leading: Icon(line['speaker'] == 'Caller' ? Icons.person : Icons.support_agent, color: const Color(0xFF667eea)),
                title: Text('${line['speaker']}: ${line['text']}', style: const TextStyle(color: Colors.white)),
                subtitle: Text(line['language'] ?? '', style: const TextStyle(color: Colors.grey)),
              ),
            )).toList(),
            const SizedBox(height: 10),
            ElevatedButton(
              onPressed: _endCall,
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red, padding: const EdgeInsets.symmetric(vertical: 15)),
              child: const Text('End Call', style: TextStyle(color: Colors.white)),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildPttTab() {
    return Column(children: [
      Expanded(child: Row(children: [
        Expanded(child: Container(
          decoration: BoxDecoration(
            color: _isSpeakerATurn ? Colors.blue.withOpacity(0.2) : Colors.transparent,
            border: Border.all(color: _isSpeakerATurn ? Colors.blue : Colors.transparent, width: 2),
            borderRadius: BorderRadius.circular(20),
          ),
          margin: const EdgeInsets.all(10),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Text('Speaker A', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 10),
            DropdownButton<String>(
              value: _speakerA,
              dropdownColor: const Color(0xFF1a1a2e),
              style: const TextStyle(color: Colors.white),
              items: _languages.map((lang) => DropdownMenuItem(value: lang['code'], child: Text(lang['name']!))).toList(),
              onChanged: (value) => setState(() => _speakerA = value!),
            ),
          ]),
        )),
        Expanded(child: Container(
          decoration: BoxDecoration(
            color: !_isSpeakerATurn ? Colors.green.withOpacity(0.2) : Colors.transparent,
            border: Border.all(color: !_isSpeakerATurn ? Colors.green : Colors.transparent, width: 2),
            borderRadius: BorderRadius.circular(20),
          ),
          margin: const EdgeInsets.all(10),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Text('Speaker B', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 10),
            DropdownButton<String>(
              value: _speakerB,
              dropdownColor: const Color(0xFF1a1a2e),
              style: const TextStyle(color: Colors.white),
              items: _languages.map((lang) => DropdownMenuItem(value: lang['code'], child: Text(lang['name']!))).toList(),
              onChanged: (value) => setState(() => _speakerB = value!),
            ),
          ]),
        )),
      ])),
      Container(
        padding: const EdgeInsets.all(20),
        child: Column(children: [
          if (_isListening)
            Container(
              height: 50,
              child: const Icon(Icons.graphic_eq, color: Colors.blue, size: 40),
            ),
          GestureDetector(
            onLongPressStart: (_) => _startPtt(),
            onLongPressEnd: (_) => _stopPtt(),
            child: Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(colors: _isListening ? [Colors.red, Colors.orange] : [Color(0xFF667eea), Color(0xFF764ba2)]),
                boxShadow: [BoxShadow(color: (_isListening ? Colors.red : Color(0xFF667eea)), blurRadius: 15, offset: Offset(0, 5))],
              ),
              child: Icon(_isListening ? Icons.mic : Icons.mic_none, color: Colors.white, size: 40),
            ),
          ),
          const SizedBox(height: 10),
          Text(_isListening ? '🎤 Listening...' : 'Hold to talk', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          ElevatedButton.icon(
            onPressed: _switchSpeaker,
            icon: const Icon(Icons.swap_horiz),
            label: const Text('Switch Speaker'),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF667eea), padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 20)),
          ),
        ]),
      ),
    ]);
  }

  Widget _buildVideoTab() {
    return Padding(
      padding: const EdgeInsets.all(20.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('🎬 Video Studio', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white)),
          const SizedBox(height: 20),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20.0),
              child: Column(children: [
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: const Color(0xFF667eea).withOpacity(0.2),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.video_library, size: 40, color: Color(0xFF667eea)),
                ),
                const SizedBox(height: 15),
                const Text('Drag & Drop Video', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 5),
                const Text('.mp4, .mov', style: TextStyle(color: Colors.grey)),
                const SizedBox(height: 20),
                Container(
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [Color(0xFF667eea), Color(0xFF764ba2)]),
                    borderRadius: BorderRadius.circular(15),
                  ),
                  child: ElevatedButton.icon(
                    onPressed: () {
                      setState(() {
                        _liveSubtitles = ['Good morning, welcome', 'Today we learn translation', 'Real-time subtitles', 'Thank you for watching'];
                      });
                    },
                    icon: const Icon(Icons.subtitles, color: Colors.white),
                    label: const Text('Show Demo Subtitles', style: TextStyle(color: Colors.white)),
                    style: ElevatedButton.styleFrom(backgroundColor: Colors.transparent, shadowColor: Colors.transparent, padding: const EdgeInsets.symmetric(vertical: 15)),
                  ),
                ),
                const SizedBox(height: 15),
                DropdownButtonFormField<String>(
                  value: _subtitleLanguage,
                  dropdownColor: const Color(0xFF1a1a2e),
                  style: const TextStyle(color: Colors.white),
                  decoration: const InputDecoration(
                    labelText: 'Subtitle Language',
                    labelStyle: TextStyle(color: Colors.grey),
                    prefixIcon: Icon(Icons.language, color: Color(0xFF667eea)),
                  ),
                  items: _languages.map((lang) => DropdownMenuItem(value: lang['code'], child: Text(lang['name']!))).toList(),
                  onChanged: (value) => setState(() => _subtitleLanguage = value!),
                ),
              ]),
            ),
          ),
          if (_liveSubtitles.isNotEmpty) ...[
            const SizedBox(height: 20),
            const Text('Live Subtitles:', style: TextStyle(fontSize: 18, color: Colors.white, fontWeight: FontWeight.bold)),
            const SizedBox(height: 10),
            ..._liveSubtitles.map((sub) => Card(
              color: Colors.black87,
              margin: const EdgeInsets.only(bottom: 6),
              child: ListTile(
                leading: const Icon(Icons.subtitles, color: Color(0xFF667eea)),
                title: Text(sub, style: const TextStyle(color: Colors.white, fontSize: 16)),
              ),
            )).toList(),
          ],
        ],
      ),
    );
  }

  Widget _buildAdminTab() {
    if (_adminDashboard == null) {
      return const Center(child: CircularProgressIndicator(color: Color(0xFF667eea)));
    }
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('⚙️ Admin Dashboard', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white)),
          const SizedBox(height: 20),
          Row(children: [
            Expanded(child: _buildStatCard('Total Users', '${_adminDashboard!['total_users']}', Icons.people, Colors.blue)),
            const SizedBox(width: 10),
            Expanded(child: _buildStatCard('Premium', '${_adminDashboard!['premium_users']}', Icons.star, Colors.orange)),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: _buildStatCard('Translations', '${_adminDashboard!['total_translations']}', Icons.translate, Colors.green)),
          ]),
          const SizedBox(height: 20),
          const Text('Users', style: TextStyle(fontSize: 18, color: Colors.white, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          ..._adminUsers.map((user) => Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: const CircleAvatar(backgroundColor: Color(0xFF667eea), child: Icon(Icons.person, color: Colors.white)),
              title: Text(user['username'] ?? '', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              subtitle: Text(user['email'] ?? '', style: const TextStyle(color: Colors.grey)),
            ),
          )).toList(),
        ],
      ),
    );
  }

  Widget _buildStatCard(String label, String value, IconData icon, Color color) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(15),
        child: Column(
          children: [
            Icon(icon, size: 30, color: color),
            const SizedBox(height: 5),
            Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white)),
            const SizedBox(height: 5),
            Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
          ],
        ),
      ),
    );
  }

  Widget _buildVoiceTranslationTab() {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.record_voice_over, size: 60, color: Color(0xFF667eea)),
            const SizedBox(height: 20),
            const Text('Voice Translation', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white)),
            const SizedBox(height: 10),
            const Text('Speak in one language, hear translation in another', style: TextStyle(color: Colors.grey)),
            const SizedBox(height: 30),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _buildLanguageDropdown(_sourceLanguage, (value) => setState(() => _sourceLanguage = value!)),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 10),
                  child: Icon(Icons.arrow_forward, color: Color(0xFF667eea)),
                ),
                _buildLanguageDropdown(_targetLanguage, (value) => setState(() => _targetLanguage = value!)),
              ],
            ),
            const SizedBox(height: 30),
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(colors: _isRecording ? [Colors.red, Colors.orange] : [Color(0xFF667eea), Color(0xFF764ba2)]),
                boxShadow: [BoxShadow(color: (_isRecording ? Colors.red : Color(0xFF667eea)), blurRadius: 15, offset: Offset(0, 5))],
              ),
              child: IconButton(
                icon: Icon(_isRecording ? Icons.stop : Icons.mic, color: Colors.white, size: 40),
                onPressed: _isRecording ? _stopRecording : _startRecording,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLiveSubtitlesTab() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.subtitles, size: 60, color: Color(0xFF667eea)),
          const SizedBox(height: 20),
          const Text('Live Subtitles', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white)),
          const SizedBox(height: 10),
          const Text('Real-time captions for any audio or video', style: TextStyle(color: Colors.grey)),
          const SizedBox(height: 30),
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.black87,
              borderRadius: BorderRadius.circular(15),
              border: Border.all(color: const Color(0xFF667eea)),
            ),
            child: const Text(
              '🎤 Listening for speech...\nSubtitles will appear here',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white, fontSize: 16),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOfflineModeTab() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.offline_bolt, size: 60, color: Color(0xFF667eea)),
          const SizedBox(height: 20),
          const Text('Offline Mode', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white)),
          const SizedBox(height: 10),
          const Text('Translate without internet connection', style: TextStyle(color: Colors.grey)),
          const SizedBox(height: 20),
          SwitchListTile(
            title: const Text('Enable Offline Mode', style: TextStyle(color: Colors.white)),
            subtitle: const Text('Download language packs for offline use', style: TextStyle(color: Colors.grey, fontSize: 12)),
            value: _isOfflineMode,
            onChanged: (value) async {
              if (value) await _loadOfflineModels();
              else setState(() => _isOfflineMode = false);
            },
            activeColor: const Color(0xFF667eea),
          ),
        ],
      ),
    );
  }

  Widget _buildUserManagementTab() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.people, size: 60, color: Color(0xFF667eea)),
          const SizedBox(height: 20),
          const Text('User Management', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white)),
          const SizedBox(height: 10),
          const Text('Manage users and permissions', style: TextStyle(color: Colors.grey)),
          const SizedBox(height: 30),
          Card(
            child: ListTile(
              leading: const Icon(Icons.person_add, color: Color(0xFF667eea)),
              title: const Text('Add New User', style: TextStyle(color: Colors.white)),
              subtitle: const Text('Create a new user account', style: TextStyle(color: Colors.grey)),
              onTap: () {},
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAnalyticsTab() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.analytics, size: 60, color: Color(0xFF667eea)),
          const SizedBox(height: 20),
          const Text('Analytics', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white)),
          const SizedBox(height: 10),
          const Text('Usage statistics and insights', style: TextStyle(color: Colors.grey)),
          const SizedBox(height: 30),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _buildStatCard('Total', '0', Icons.translate, Colors.blue),
              const SizedBox(width: 10),
              _buildStatCard('Users', '0', Icons.people, Colors.green),
              const SizedBox(width: 10),
              _buildStatCard('Calls', '0', Icons.call, Colors.orange),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildHelpCenterTab() {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Text('❓ Help Center', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white)),
        const SizedBox(height: 20),
        _buildHelpItem('How to translate text?', 'Type text in the box and tap Translate'),
        _buildHelpItem('How to use voice?', 'Tap the mic button and speak'),
        _buildHelpItem('What languages are supported?', '50+ African and international languages'),
        _buildHelpItem('How to use offline mode?', 'Enable offline mode in settings'),
        _buildHelpItem('Contact support', 'Email: support@lingolink.ai'),
      ],
    );
  }

  Widget _buildSettingsTab() {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Text('⚙️ Settings', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white)),
        const SizedBox(height: 20),
        SwitchListTile(
          title: const Text('Dark Mode', style: TextStyle(color: Colors.white)),
          subtitle: const Text('Always dark for now', style: TextStyle(color: Colors.grey, fontSize: 12)),
          value: true,
          onChanged: (value) {},
          activeColor: const Color(0xFF667eea),
        ),
        SwitchListTile(
          title: const Text('Auto Translate', style: TextStyle(color: Colors.white)),
          subtitle: const Text('Translate as you type', style: TextStyle(color: Colors.grey, fontSize: 12)),
          value: true,
          onChanged: (value) {},
          activeColor: const Color(0xFF667eea),
        ),
      ],
    );
  }

  Widget _buildAboutTab() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const LinearGradient(colors: [Color(0xFF667eea), Color(0xFF764ba2)]),
              boxShadow: [BoxShadow(color: const Color(0xFF667eea).withOpacity(0.3), blurRadius: 20, offset: const Offset(0, 5))],
            ),
            child: const Icon(Icons.translate, color: Colors.white, size: 50),
          ),
          const SizedBox(height: 20),
          const Text('🌐 LingoLink AI', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.white)),
          const SizedBox(height: 10),
          const Text('Enterprise AI Translation Platform', style: TextStyle(color: Colors.grey)),
          const SizedBox(height: 20),
          const Text('Version 1.0.0', style: TextStyle(color: Colors.grey, fontSize: 14)),
          const SizedBox(height: 10),
          const Text('© 2026 LingoLink AI. All rights reserved.', style: TextStyle(color: Colors.grey, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _buildHelpItem(String title, String description) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: const Icon(Icons.help_outline, color: Color(0xFF667eea)),
        title: Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        subtitle: Text(description, style: const TextStyle(color: Colors.grey)),
      ),
    );
  }

  Widget _buildLanguageDropdown(String value, Function(String?) onChanged) {
    return DropdownButton<String>(
      value: value,
      dropdownColor: const Color(0xFF1a1a2e),
      style: const TextStyle(color: Colors.white, fontSize: 12),
      items: _languages.map((lang) => DropdownMenuItem(
        value: lang['code'],
        child: Text(lang['name']!, overflow: TextOverflow.ellipsis),
      )).toList(),
      onChanged: onChanged,
    );
  }
}