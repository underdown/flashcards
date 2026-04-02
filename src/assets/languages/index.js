/**
 * Language metadata and lazy-loaded JSON (categories + words).
 */
export const languages = {
  russian: {
    name: 'Russian',
    code: 'ru-RU',
    data: () => import('./russian.json'),
  },
  spanish: {
    name: 'Spanish',
    code: 'es-ES',
    data: () => import('./spanish.json'),
  },
  chinese: {
    name: 'Chinese',
    code: 'zh-CN',
    data: () => import('./chinese.json'),
  },
  japanese: {
    name: 'Japanese',
    code: 'ja-JP',
    data: () => import('./japanese.json'),
  },
};

export const languageIds = Object.keys(languages);

export function getLanguageCode(languageId) {
  return languages[languageId]?.code ?? 'en-US';
}
