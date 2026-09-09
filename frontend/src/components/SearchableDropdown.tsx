import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../App';

export const LANGUAGES: Record<string, string> = {
  english: 'English', spanish: 'Spanish', french: 'French', german: 'German',
  portuguese: 'Portuguese', italian: 'Italian', dutch: 'Dutch', russian: 'Russian',
  arabic: 'Arabic', hindi: 'Hindi', chinese: 'Chinese', japanese: 'Japanese',
  korean: 'Korean', turkish: 'Turkish',
  luganda: 'Luganda', rukiga: 'Rukiga', runyankole: 'Runyankole',
  acholi: 'Acholi', alur: 'Alur', ateso: 'Ateso', lango: 'Lango',
  lugbara: 'Lugbara', lusoga: 'Lusoga', lugwere: 'Lugwere',
  swahili: 'Swahili', kinyarwanda: 'Kinyarwanda', kirundi: 'Kirundi',
  amharic: 'Amharic', somali: 'Somali', oromo: 'Oromo', tigrinya: 'Tigrinya',
  kikuyu: 'Kikuyu', dholuo: 'Dholuo',
  yoruba: 'Yoruba', hausa: 'Hausa', igbo: 'Igbo', fulfulde: 'Fulfulde',
  wolof: 'Wolof', bambara: 'Bambara', twi: 'Twi', ewe: 'Ewe',
  lingala: 'Lingala', kikongo: 'Kikongo', bemba: 'Bemba', chichewa: 'Chichewa',
  zulu: 'Zulu', xhosa: 'Xhosa', afrikaans: 'Afrikaans', sesotho: 'Sesotho',
  setswana: 'Setswana', shona: 'Shona',
  kabyle: 'Kabyle', tachelhit: 'Tachelhit',
};

interface Props {
  value: string;
  onChange: (code: string) => void;
  placeholder: string;
  includeAutoDetect?: boolean;
}

export default function SearchableDropdown({ value, onChange, placeholder, includeAutoDetect = false }: Props) {
  const { darkMode } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = Object.entries(LANGUAGES).filter(([code, name]) =>
    name.toLowerCase().includes(search.toLowerCase()) || code.toLowerCase().includes(search.toLowerCase())
  );

  const displayName = value === 'auto' ? 'Auto Detect' : (LANGUAGES[value] || value);

  return (
    <div className="lang-select" ref={ref}>
      <button
        className={`lang-select-btn ${isOpen ? 'active' : ''} ${darkMode ? 'dark' : 'light'}`}
        onClick={() => { setIsOpen(!isOpen); setSearch(''); }}
      >
        <span className="lang-select-value">
          {value === 'auto' ? '🔍' : '🌐'} {displayName}
        </span>
        <svg className={`lang-select-arrow ${isOpen ? 'up' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div className={`lang-select-menu ${darkMode ? 'dark' : 'light'}`}>
          <div className="lang-select-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder={`Search ${placeholder}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className={darkMode ? 'dark' : 'light'}
            />
            {search && (
              <button className="lang-select-clear" onClick={() => setSearch('')}>×</button>
            )}
          </div>
          <div className="lang-select-options">
            {includeAutoDetect && (
              <div
                className={`lang-select-option ${value === 'auto' ? 'selected' : ''}`}
                onClick={() => { onChange('auto'); setIsOpen(false); }}
              >
                <span>🔍 Auto Detect</span>
                {value === 'auto' && <span className="lang-select-check">✓</span>}
              </div>
            )}
            {filtered.map(([code, name]) => (
              <div
                key={code}
                className={`lang-select-option ${value === code ? 'selected' : ''}`}
                onClick={() => { onChange(code); setIsOpen(false); }}
              >
                <span>{name}</span>
                <span className="lang-select-code">{code}</span>
                {value === code && <span className="lang-select-check">✓</span>}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="lang-select-empty">No results for "{search}"</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}