/**
 * Word counting and readability scoring: Flesch Reading Ease, Flesch–Kincaid
 * grade, Gunning Fog, SMOG, Coleman–Liau, ARI, plus reading/speaking time,
 * keyword density and sentence length distribution.
 */

export interface WordStats {
  characters: number;
  charactersNoSpaces: number;
  letters: number;
  words: number;
  uniqueWords: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  syllables: number;
  complexWords: number;
  longestWord: string;
  avgWordLength: number;
  avgSentenceLength: number;
  readingTimeSeconds: number;
  speakingTimeSeconds: number;
  topWords: Array<{ word: string; count: number; percent: number }>;
  scores: {
    fleschReadingEase: number;
    fleschKincaidGrade: number;
    gunningFog: number;
    smog: number;
    colemanLiau: number;
    ari: number;
  };
  gradeLabel: string;
  easeLabel: string;
}

const STOPWORDS = new Set(
  'a an and are as at be but by for from has have he her his i if in is it its me my not of on or our she so that the their them they this to was we were what which who will with you your'.split(' '),
);

export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const s = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/([aeiouy])le$/, '$1l')
    .replace(/^y/, '')
    .match(/[aeiouy]+/g)?.length ?? 1;
  return Math.max(1, s);
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…]["')\]]?)\s+(?=[A-Z0-9“"([])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function tokenizeWords(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
}

function easeLabel(score: number): string {
  if (score >= 90) return 'Very easy — 5th grade';
  if (score >= 80) return 'Easy — 6th grade';
  if (score >= 70) return 'Fairly easy — 7th grade';
  if (score >= 60) return 'Plain English — 8th–9th grade';
  if (score >= 50) return 'Fairly difficult — high school';
  if (score >= 30) return 'Difficult — college';
  if (score >= 10) return 'Very difficult — graduate';
  return 'Extremely difficult — professional';
}

function gradeLabel(grade: number): string {
  if (grade < 1) return 'Kindergarten';
  if (grade <= 12) return `Grade ${Math.round(grade)}`;
  if (grade <= 16) return 'College level';
  return 'Graduate level';
}

export function analyzeText(text: string, options: { wpm?: number; spm?: number } = {}): WordStats {
  const wpm = options.wpm ?? 238;
  const spm = options.spm ?? 150;
  const words = tokenizeWords(text);
  const sentences = words.length ? splitSentences(text) : [];
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  const syllableCounts = words.map(countSyllables);
  const syllables = syllableCounts.reduce((a, b) => a + b, 0);
  const complexWords = syllableCounts.filter((s) => s >= 3).length;
  const wordCount = words.length;
  const sentenceCount = Math.max(1, sentences.length);
  const safeWords = Math.max(1, wordCount);

  const freq = new Map<string, number>();
  for (const w of words) {
    const key = w.toLowerCase();
    if (STOPWORDS.has(key) || key.length < 3) continue;
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  const topWords = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([word, count]) => ({ word, count, percent: (count / safeWords) * 100 }));

  const fleschReadingEase = wordCount ? 206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllables / safeWords) : 0;
  const fleschKincaidGrade = wordCount ? 0.39 * (wordCount / sentenceCount) + 11.8 * (syllables / safeWords) - 15.59 : 0;
  const gunningFog = wordCount ? 0.4 * (wordCount / sentenceCount + 100 * (complexWords / safeWords)) : 0;
  const smog = wordCount ? 1.043 * Math.sqrt(complexWords * (30 / sentenceCount)) + 3.1291 : 0;
  const L = (letters / safeWords) * 100;
  const S = (sentenceCount / safeWords) * 100;
  const colemanLiau = wordCount ? 0.0588 * L - 0.296 * S - 15.8 : 0;
  const ari = wordCount ? 4.71 * (letters / safeWords) + 0.5 * (wordCount / sentenceCount) - 21.43 : 0;
  const avgGrade = wordCount ? (fleschKincaidGrade + gunningFog + colemanLiau + ari) / 4 : 0;

  return {
    characters: Array.from(text).length,
    charactersNoSpaces: Array.from(text.replace(/\s/g, '')).length,
    letters,
    words: wordCount,
    uniqueWords: new Set(words.map((w) => w.toLowerCase())).size,
    sentences: wordCount ? sentences.length : 0,
    paragraphs,
    lines: text ? text.split(/\r?\n/).length : 0,
    syllables,
    complexWords,
    longestWord: words.reduce((a, b) => (b.length > a.length ? b : a), ''),
    avgWordLength: wordCount ? letters / wordCount : 0,
    avgSentenceLength: wordCount ? wordCount / sentenceCount : 0,
    readingTimeSeconds: Math.round((wordCount / wpm) * 60),
    speakingTimeSeconds: Math.round((wordCount / spm) * 60),
    topWords,
    scores: {
      fleschReadingEase: clampScore(fleschReadingEase, -50, 121.22),
      fleschKincaidGrade: Math.max(0, fleschKincaidGrade),
      gunningFog: Math.max(0, gunningFog),
      smog: Math.max(0, smog),
      colemanLiau: Math.max(0, colemanLiau),
      ari: Math.max(0, ari),
    },
    gradeLabel: gradeLabel(avgGrade),
    easeLabel: easeLabel(fleschReadingEase),
  };
}

function clampScore(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export const PLATFORM_LIMITS: Array<{ name: string; limit: number; unit: 'characters' | 'words' }> = [
  { name: 'Tweet / X post', limit: 280, unit: 'characters' },
  { name: 'SMS', limit: 160, unit: 'characters' },
  { name: 'Meta title', limit: 60, unit: 'characters' },
  { name: 'Meta description', limit: 160, unit: 'characters' },
  { name: 'Instagram caption', limit: 2200, unit: 'characters' },
  { name: 'LinkedIn post', limit: 3000, unit: 'characters' },
  { name: 'YouTube title', limit: 100, unit: 'characters' },
  { name: 'Blog post (ideal)', limit: 1600, unit: 'words' },
];
