import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import { useTheme } from '../App';
import jsPDF from 'jspdf';

interface Props {
  token: string;
}

interface TranslationRecord {
  id: number;
  source_text: string;
  translated_text: string;
  source_language: string;
  target_language: string;
  created_at: string;
}

export default function History({ token }: Props) {
  const { darkMode } = useTheme();
  const [history, setHistory] = useState<TranslationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  useEffect(() => {
    fetchHistory();
  }, [token]);

  const fetchHistory = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/translate/history`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      } else {
        setError('Failed to fetch history');
      }
    } catch {
      setError('Backend not running');
    } finally {
      setLoading(false);
    }
  };

  const deleteTranslation = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/translate/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        setHistory(prev => prev.filter(item => item.id !== id));
      }
    } catch {}
  };

  const clearAllHistory = async () => {
    if (!window.confirm('Clear all translation history?')) return;
    try {
      for (const item of history) {
        await fetch(`${API_URL}/translate/${item.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        });
      }
      setHistory([]);
    } catch {}
  };

  const filteredHistory = history.filter(item => {
    const matchesSearch =
      item.source_text.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.translated_text.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filter === 'all') return true;
    const itemDate = new Date(item.created_at);
    const now = new Date();

    if (filter === 'today') {
      return itemDate.toDateString() === now.toDateString();
    }
    if (filter === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return itemDate >= weekAgo;
    }
    if (filter === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return itemDate >= monthAgo;
    }
    return true;
  });

  // ---------- PDF EXPORT ----------
  const exportToPDF = async () => {
    if (filteredHistory.length === 0) return;
    setExporting(true);
    try {
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      // Header
      pdf.setFillColor(212, 160, 74); // warm gold
      pdf.rect(0, 0, pageWidth, 22, 'F');

      pdf.setTextColor(26, 18, 8);
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text('LingoLink AI', margin, 12);

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text('Translation History', margin, 17);

      pdf.setFontSize(9);
      pdf.text(
        new Date().toLocaleString(),
        pageWidth - margin,
        12,
        { align: 'right' }
      );
      pdf.text(
        `${filteredHistory.length} entries`,
        pageWidth - margin,
        17,
        { align: 'right' }
      );

      y = 32;

      // Entries
      pdf.setTextColor(26, 18, 8);
      filteredHistory.forEach((item, index) => {
        const sourceLines = pdf.splitTextToSize(item.source_text || '', contentWidth - 4);
        const translatedLines = pdf.splitTextToSize(item.translated_text || '', contentWidth - 4);
        const blockHeight =
          14 + sourceLines.length * 5 + translatedLines.length * 5 + 8;

        // Page break check
        if (y + blockHeight > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }

        // Card border
        pdf.setDrawColor(212, 160, 74);
        pdf.setLineWidth(0.3);
        pdf.roundedRect(margin, y, contentWidth, blockHeight - 3, 2, 2);

        // Gold left bar
        pdf.setFillColor(212, 160, 74);
        pdf.rect(margin, y, 1.2, blockHeight - 3, 'F');

        // Date + index
        pdf.setFontSize(8);
        pdf.setTextColor(120, 100, 70);
        pdf.setFont('helvetica', 'normal');
        const dateStr = new Date(item.created_at).toLocaleString();
        pdf.text(`#${index + 1}  •  ${dateStr}`, margin + 4, y + 5);

        // Source
        pdf.setFontSize(8);
        pdf.setTextColor(150, 120, 60);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`SOURCE (${item.source_language.toUpperCase()})`, margin + 4, y + 11);

        pdf.setFontSize(10);
        pdf.setTextColor(26, 18, 8);
        pdf.setFont('helvetica', 'normal');
        pdf.text(sourceLines, margin + 4, y + 16);

        // Translation
        const transY = y + 16 + sourceLines.length * 5 + 1;
        pdf.setFontSize(8);
        pdf.setTextColor(150, 120, 60);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`TRANSLATION (${item.target_language.toUpperCase()})`, margin + 4, transY);

        pdf.setFontSize(10);
        pdf.setTextColor(184, 134, 46);
        pdf.setFont('helvetica', 'normal');
        pdf.text(translatedLines, margin + 4, transY + 5);

        y += blockHeight;
      });

      // Footer on each page
      const totalPages = (pdf as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(150, 130, 100);
        pdf.text(
          '© 2026 LingoLink AI — Enterprise AI Translation Platform',
          pageWidth / 2,
          pageHeight - 8,
          { align: 'center' }
        );
        pdf.text(
          `Page ${i} of ${totalPages}`,
          pageWidth - margin,
          pageHeight - 8,
          { align: 'right' }
        );
      }

      const filename = `lingolink-history-${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(filename);
    } catch (err) {
      console.error('PDF export failed:', err);
      setError('PDF export failed. Try again.');
    } finally {
      setExporting(false);
    }
  };

  const speakTranslation = async (text: string, lang: string) => {
    try {
      const res = await fetch(`${API_URL}/tts/speak?text=${encodeURIComponent(text)}&language=${lang}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        new Audio(URL.createObjectURL(blob)).play();
      }
    } catch {}
  };

  const copyTranslation = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('Copied!');
    } catch {}
  };

  return (
    <div className={`history-root ${darkMode ? 'history-dark' : 'history-light'}`}>
      <div className="history-header">
        <div>
          <h2>📜 Translation History</h2>
          <p>Your recent translations across all languages</p>
        </div>
        <div className="history-actions">
          {filteredHistory.length > 0 && (
            <button
              className="history-export"
              onClick={exportToPDF}
              disabled={exporting}
              title="Download as PDF"
            >
              {exporting ? '⏳ Exporting...' : '📄 Export PDF'}
            </button>
          )}
          <button className="history-refresh" onClick={fetchHistory} disabled={loading}>
            {loading ? '⏳' : '🔄'} Refresh
          </button>
          {history.length > 0 && (
            <button className="history-clear-all" onClick={clearAllHistory}>
              🗑️ Clear All
            </button>
          )}
        </div>
      </div>

      <div className="history-toolbar">
        <div className="history-search">
          <input
            type="text"
            placeholder="🔍 Search translations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="history-filters">
          <button className={`history-filter ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
          <button className={`history-filter ${filter === 'today' ? 'active' : ''}`} onClick={() => setFilter('today')}>Today</button>
          <button className={`history-filter ${filter === 'week' ? 'active' : ''}`} onClick={() => setFilter('week')}>This Week</button>
          <button className={`history-filter ${filter === 'month' ? 'active' : ''}`} onClick={() => setFilter('month')}>This Month</button>
        </div>
      </div>

      {error && <p className="history-error">❌ {error}</p>}

      {filteredHistory.length === 0 ? (
        <div className="history-empty">
          <span className="history-empty-icon">📭</span>
          <p>No translations found</p>
          <span>Start translating to see your history here</span>
        </div>
      ) : (
        <div className="history-list">
          {filteredHistory.map((item) => (
            <div key={item.id} className="history-item">
              <div className="history-item-header">
                <span className="history-date">
                  {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString()}
                </span>
                <div className="history-item-actions">
                  <button className="history-item-btn" onClick={() => speakTranslation(item.translated_text, item.target_language)} title="Hear">
                    🔊
                  </button>
                  <button className="history-item-btn" onClick={() => copyTranslation(item.translated_text)} title="Copy">
                    📋
                  </button>
                  <button className="history-item-btn delete" onClick={() => deleteTranslation(item.id)} title="Delete">
                    🗑️
                  </button>
                </div>
              </div>
              <div className="history-item-body">
                <div className="history-source">
                  <span className="history-label">SOURCE ({item.source_language})</span>
                  <p>{item.source_text}</p>
                </div>
                <div className="history-arrow">→</div>
                <div className="history-target">
                  <span className="history-label">TRANSLATION ({item.target_language})</span>
                  <p>{item.translated_text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="history-stats">
          <div className="history-stat-item">
            <span className="history-stat-value">{history.length}</span>
            <span className="history-stat-label">Total</span>
          </div>
          <div className="history-stat-item">
            <span className="history-stat-value">
              {new Set(history.map(h => h.target_language)).size}
            </span>
            <span className="history-stat-label">Languages</span>
          </div>
          <div className="history-stat-item">
            <span className="history-stat-value">
              {history.filter(h => new Date(h.created_at).toDateString() === new Date().toDateString()).length}
            </span>
            <span className="history-stat-label">Today</span>
          </div>
        </div>
      )}
    </div>
  );
}