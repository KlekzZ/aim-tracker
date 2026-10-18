// Splits a knowledge source into small, self-contained chunks for retrieval.
// Each chunk gets a short "Kilde: ..." header, so a language model that only
// sees one chunk out of context still knows where it came from.
//
// Two formats are understood:
//  - Markdown with headings (#, ##, ###): split by heading, long sections
//    are split further by paragraph.
//  - A list of "Title: ...\nURL: ..." blocks (YouTube transcripts pasted
//    one after another, optionally grouped under a creator name line).
// Anything else falls back to splitting on blank lines.

const TARGET_WORDS = 300;
const MAX_WORDS = 480;
const OVERLAP_WORDS = 50;

const wordCount = (text) => (text.trim() ? text.trim().split(/\s+/).length : 0);

// Splits long text into chunks of about TARGET_WORDS, each one starting
// with a bit of the previous chunk's end so context isn't lost at the seam.
function splitByParagraphs(text) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (!paragraphs.length) return [];

  const chunks = [];
  let current = [];
  let words = 0;
  const flush = () => { if (current.length) { chunks.push(current.join('\n\n')); current = []; words = 0; } };

  for (const paragraph of paragraphs) {
    const w = wordCount(paragraph);
    if (words + w > MAX_WORDS && current.length) flush();
    current.push(paragraph);
    words += w;
    if (words >= TARGET_WORDS) flush();
  }
  flush();

  for (let i = 1; i < chunks.length; i++) {
    const tail = chunks[i - 1].split(/\s+/).slice(-OVERLAP_WORDS).join(' ');
    chunks[i] = `(... ${tail})\n\n${chunks[i]}`;
  }
  return chunks;
}

function withHeader(breadcrumb, text) {
  return breadcrumb ? `Kilde: ${breadcrumb}\n\n${text}` : text;
}

// ---------- Markdown headings ----------

const HEADING = /^(#{1,6})\s+(.+?)\s*$/;

function chunkHeadings(text, title) {
  const lines = text.split(/\r?\n/);
  // Body before the first heading belongs to a "preamble" section, labelled
  // with just the title. The heading stack starts empty, so a document's own
  // "# Title" heading becomes the root instead of duplicating the title.
  const sections = [{ heading: null, breadcrumb: title, bodyLines: [] }];
  const stack = [];

  for (const line of lines) {
    const match = HEADING.exec(line);
    if (!match) {
      sections[sections.length - 1].bodyLines.push(line);
      continue;
    }
    const level = match[1].length;
    const heading = match[2].trim();
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    stack.push({ level, heading });
    // If the document's headings start below level 1 (e.g. straight to ##),
    // there is no document-level heading to anchor the breadcrumb, so prefix
    // the title to keep each chunk understandable on its own.
    const prefix = stack[0].level > 1 ? `${title} > ` : '';
    sections.push({ heading, breadcrumb: prefix + stack.map((s) => s.heading).join(' > '), bodyLines: [] });
  }

  const chunks = [];
  for (const section of sections) {
    const body = section.bodyLines.join('\n').trim();
    if (!body) continue; // heading with only subheadings under it, no own text
    const pieces = wordCount(body) > MAX_WORDS ? splitByParagraphs(body) : [body];
    for (const piece of pieces) {
      chunks.push({ headingPath: section.breadcrumb, metaTitle: null, metaUrl: null, text: withHeader(section.breadcrumb, piece) });
    }
  }
  return chunks;
}

// ---------- "Title: .../URL: ..." transcript lists ----------

const TITLE_LINE = /^Title:\s*(.+?)\s*$/;
const URL_LINE = /^URL:\s*(.+?)\s*$/;
// A short line ending in ":" that isn't itself a Title/URL line: treated as
// a creator name heading, e.g. "Viscose/DumbassLaura:" or "MattyOW:".
const CREATOR_LINE = /^(?!Title:|URL:)([^\n:]{1,60}):\s*$/;

function looksLikeTranscriptList(text) {
  return (text.match(/^Title:\s*.+$/gm) || []).length >= 2;
}

function chunkTranscripts(text, title) {
  const lines = text.split(/\r?\n/);
  const videos = [];
  let creator = null;
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const titleMatch = TITLE_LINE.exec(lines[i]);
    if (titleMatch && URL_LINE.test(lines[i + 1] || '')) {
      if (current) videos.push(current);
      current = { creator, videoTitle: titleMatch[1], url: URL_LINE.exec(lines[i + 1])[1], bodyLines: [] };
      i++; // skip the URL line, already consumed
      continue;
    }
    const creatorMatch = CREATOR_LINE.exec(lines[i]);
    // Only treat it as a creator header if a video title follows shortly after.
    if (creatorMatch && lines.slice(i + 1, i + 3).some((l) => TITLE_LINE.test(l))) {
      creator = creatorMatch[1].trim();
      continue;
    }
    if (current) current.bodyLines.push(lines[i]);
  }
  if (current) videos.push(current);

  const chunks = [];
  for (const video of videos) {
    const body = video.bodyLines.join('\n').trim();
    if (!body) continue;
    const breadcrumb = [title, video.creator, video.videoTitle].filter(Boolean).join(' > ');
    const label = `${video.creator ? video.creator + ' – ' : ''}"${video.videoTitle}" (YouTube)`;
    for (const piece of splitByParagraphs(body)) {
      chunks.push({ headingPath: breadcrumb, metaTitle: video.videoTitle, metaUrl: video.url, text: withHeader(label, piece) });
    }
  }
  return chunks;
}

// ---------- Entry point ----------

function chunkSource(text, title) {
  if (looksLikeTranscriptList(text)) return chunkTranscripts(text, title);
  if (/^#{1,6}\s+/m.test(text)) return chunkHeadings(text, title);
  return splitByParagraphs(text).map((piece) => ({ headingPath: title, metaTitle: null, metaUrl: null, text: withHeader(title, piece) }));
}

module.exports = { chunkSource, wordCount, TARGET_WORDS, MAX_WORDS };
