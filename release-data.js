// Add a named release here when shipping a new site version.
// Keep descriptions factual and describe changes visible to users.
export const RELEASES = [
  {
    version: '18.46', date: '2026-10-05', type: 'update', size: 'medium',
    title: { ru: 'Что нового и история обновлений', kz: 'Жаңалықтар мен жаңартулар тарихы' },
    updates: {
      ru: [
        'После обновления появляется карточка с названием версии и списком изменений.',
        'В меню добавлена «История обновлений» — к описаниям можно вернуться в любое время.',
        'В истории отдельно отмечаются исправления и масштаб обновлений.'
      ],
      kz: [
        'Жаңартудан кейін нұсқа атауы мен өзгерістер тізімі бар карточка көрсетіледі.',
        'Мәзірге «Жаңартулар тарихы» қосылды — сипаттамаларды кез келген уақытта көруге болады.',
        'Тарихта түзетулер мен жаңартулар ауқымы бөлек белгіленеді.'
      ]
    }
  },
  {
    version: '18.45', date: '2026-10-05', type: 'fix',
    title: { ru: 'Кнопка обновления и расписание звонков', kz: 'Жаңарту түймесі және қоңырау кестесі' },
    fixes: {
      ru: [
        'В меню вернулась постоянная кнопка «Обновить».',
        'Сайт проверяет новую версию и предлагает загрузить обновление.',
        'Обновлено мобильное оформление кнопки и редактора расписания звонков.'
      ],
      kz: [
        'Мәзірге тұрақты «Жаңарту» түймесі қайтарылды.',
        'Сайт жаңа нұсқаны тексеріп, жаңартуды жүктеуді ұсынады.',
        'Қоңырау кестесі түймесі мен редакторының мобильді көрінісі жаңартылды.'
      ]
    }
  }
];

function versionParts(version) { return String(version).split('.').map(Number); }
export function releaseForBuild(build) {
  const version = String(build || '').match(/^step(\d+\.\d+)(?:-|$)/)?.[1];
  return RELEASES.find(release => release.version === version) || null;
}
export function releasesForBuild(build) {
  const current = releaseForBuild(build);
  if (!current) return [];
  const [major, minor] = versionParts(current.version);
  return RELEASES.filter(release => {
    const [releaseMajor, releaseMinor] = versionParts(release.version);
    return releaseMajor < major || (releaseMajor === major && releaseMinor <= minor);
  });
}

export const UPDATE_LEVELS = {
  small: { ru: 'Мини-обновление', kz: 'Шағын жаңарту' },
  medium: { ru: 'Среднее обновление', kz: 'Орташа жаңарту' },
  major: { ru: 'Крупное обновление', kz: 'Ірі жаңарту' }
};
export function releaseTypeLabel(release, language = 'ru') {
  if (release.type === 'fix') return language === 'kz' ? 'Түзетулер' : 'Исправления';
  return UPDATE_LEVELS[release.size]?.[language] || (language === 'kz' ? 'Жаңарту' : 'Обновление');
}
