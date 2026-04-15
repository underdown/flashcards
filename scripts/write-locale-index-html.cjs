/**
 * After `react-scripts build`, writes locale-specific index.html under
 * build/{russian,chinese,spanish,japanese}/ so crawlers get correct og:image
 * per language path. Root build/index.html stays as the neutral template from public/index.html.
 */
const fs = require('fs');
const path = require('path');

const BUILD_DIR = path.join(__dirname, '..', 'build');
const SRC_INDEX = path.join(BUILD_DIR, 'index.html');

const SITE = 'https://kartochki.app';

/** Must match public/index.html (neutral defaults). */
const NEUTRAL = {
  htmlLang: 'en',
  metaDescription:
    'Practice Russian, Spanish, Chinese, or Japanese pronunciation with flashcards. Speech recognition and audio in your browser. Stats stay on your device.',
  ogUrl: `${SITE}/`,
  ogTitle: 'Kartochki — Language flashcards',
  ogDescription:
    'Vocabulary flashcards with text-to-speech and speech recognition. Choose a language and practice speaking; no tracking.',
  ogImage: `${SITE}/og-spanish.png`,
  ogImageAlt: 'Kartochki — language flashcards — https://kartochki.app',
  twitterTitle: 'Kartochki — Language flashcards',
  twitterDescription:
    'Vocabulary flashcards with text-to-speech and speech recognition. Practice speaking; no tracking.',
  twitterImage: `${SITE}/og-spanish.png`,
  pageTitle: 'Kartochki — Language flashcards',
};

const LOCALES = {
  russian: {
    htmlLang: 'en',
    metaDescription:
      'Russian vocabulary flashcards with text-to-speech and speech recognition in your browser. Stats stay on your device.',
    ogUrl: `${SITE}/russian`,
    ogTitle: 'Kartochki — Learn Russian pronunciation',
    ogDescription:
      'Russian vocabulary flashcards with text-to-speech and speech recognition. Practice speaking; no tracking.',
    ogImage: `${SITE}/og-russian.png`,
    ogImageAlt: 'Learn Russian — https://kartochki.app/russian',
    twitterTitle: 'Kartochki — Learn Russian pronunciation',
    twitterDescription:
      'Russian vocabulary flashcards with text-to-speech and speech recognition. Practice speaking; no tracking.',
    twitterImage: `${SITE}/og-russian.png`,
    pageTitle: 'Kartochki — Learn Russian pronunciation',
  },
  chinese: {
    htmlLang: 'en',
    metaDescription:
      'Chinese vocabulary flashcards with text-to-speech and speech recognition in your browser. Stats stay on your device.',
    ogUrl: `${SITE}/chinese`,
    ogTitle: 'Kartochki — Learn Chinese pronunciation',
    ogDescription:
      'Chinese vocabulary flashcards with text-to-speech and speech recognition. Practice speaking; no tracking.',
    ogImage: `${SITE}/og-chinese.png`,
    ogImageAlt: 'Learn Chinese — https://kartochki.app/chinese',
    twitterTitle: 'Kartochki — Learn Chinese pronunciation',
    twitterDescription:
      'Chinese vocabulary flashcards with text-to-speech and speech recognition. Practice speaking; no tracking.',
    twitterImage: `${SITE}/og-chinese.png`,
    pageTitle: 'Kartochki — Learn Chinese pronunciation',
  },
  spanish: {
    htmlLang: 'en',
    metaDescription:
      'Spanish vocabulary flashcards with text-to-speech and speech recognition in your browser. Stats stay on your device.',
    ogUrl: `${SITE}/spanish`,
    ogTitle: 'Kartochki — Learn Spanish pronunciation',
    ogDescription:
      'Spanish vocabulary flashcards with text-to-speech and speech recognition. Practice speaking; no tracking.',
    ogImage: `${SITE}/og-spanish.png`,
    ogImageAlt: 'Learn Spanish — https://kartochki.app/spanish',
    twitterTitle: 'Kartochki — Learn Spanish pronunciation',
    twitterDescription:
      'Spanish vocabulary flashcards with text-to-speech and speech recognition. Practice speaking; no tracking.',
    twitterImage: `${SITE}/og-spanish.png`,
    pageTitle: 'Kartochki — Learn Spanish pronunciation',
  },
  japanese: {
    htmlLang: 'ja',
    metaDescription:
      'Practice Japanese pronunciation with flashcards: hiragana, katakana, and kanji. Speech recognition and audio in your browser. Stats stay on your device.',
    ogUrl: `${SITE}/japanese`,
    ogTitle: 'Kartochki — Learn Japanese pronunciation',
    ogDescription:
      'Hiragana, katakana, and kanji flashcards with text-to-speech and speech recognition. Practice speaking; no tracking.',
    ogImage: `${SITE}/og-japanese.png`,
    ogImageAlt: 'Learn Japanese — 日本語を学ぶ — https://kartochki.app/japanese',
    twitterTitle: 'Kartochki — Learn Japanese pronunciation',
    twitterDescription:
      'Hiragana, katakana, and kanji flashcards with text-to-speech and speech recognition. Practice speaking; no tracking.',
    twitterImage: `${SITE}/og-japanese.png`,
    pageTitle: 'Kartochki — Learn Japanese pronunciation',
  },
};

function replaceAll(haystack, from, to) {
  if (!from) return haystack;
  return haystack.split(from).join(to);
}

function applyLocale(html, locale) {
  const n = NEUTRAL;
  let h = replaceAll(html, `<html lang="${n.htmlLang}">`, `<html lang="${locale.htmlLang}">`);
  h = replaceAll(h, n.metaDescription, locale.metaDescription);
  h = replaceAll(h, n.ogDescription, locale.ogDescription);
  h = replaceAll(h, n.ogTitle, locale.ogTitle);
  h = replaceAll(h, n.ogImageAlt, locale.ogImageAlt);
  h = replaceAll(h, n.twitterDescription, locale.twitterDescription);
  h = replaceAll(h, n.twitterTitle, locale.twitterTitle);
  // Full image URLs before any shorter site URL (og:url is https://kartochki.app/ and must not run first).
  h = replaceAll(h, n.ogImage, locale.ogImage);
  h = replaceAll(h, n.twitterImage, locale.twitterImage);
  h = replaceAll(h, `property="og:url" content="${n.ogUrl}"`, `property="og:url" content="${locale.ogUrl}"`);
  h = replaceAll(h, `<title>${n.pageTitle}</title>`, `<title>${locale.pageTitle}</title>`);
  return h;
}

function main() {
  if (!fs.existsSync(SRC_INDEX)) {
    console.error('write-locale-index-html: build/index.html not found. Run react-scripts build first.');
    process.exit(1);
  }

  const template = fs.readFileSync(SRC_INDEX, 'utf8');

  if (!template.includes(NEUTRAL.ogUrl)) {
    console.error(
      'write-locale-index-html: build/index.html does not match NEUTRAL meta. Sync NEUTRAL in scripts/write-locale-index-html.cjs with public/index.html.'
    );
    process.exit(1);
  }

  for (const [dir, locale] of Object.entries(LOCALES)) {
    const outDir = path.join(BUILD_DIR, dir);
    fs.mkdirSync(outDir, { recursive: true });
    const outHtml = applyLocale(template, locale);
    fs.writeFileSync(path.join(outDir, 'index.html'), outHtml, 'utf8');
    console.log(`Wrote ${dir}/index.html`);
  }
}

main();
