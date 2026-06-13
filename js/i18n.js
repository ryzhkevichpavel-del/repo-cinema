/* i18n.js — tiny EN/RU dictionary for the UI shell and canvas film.
   Language is auto-detected from the browser, toggleable, remembered in
   localStorage. */

'use strict';

const RC_I18N = (() => {

  const DICT = {
    en: {
      page_title: 'Repo Cinema — every repo deserves a premiere',
      tagline: 'Every repo deserves a premiere.',
      placeholder: 'github.com/owner/repo or owner/repo',
      premiere: 'Premiere ▶',
      now_showing: 'Now showing:',
      token_summary: 'Have a token? Raise your limit',
      token_note: 'A GitHub personal access token raises the API limit from 60 to 5,000 requests/hour. It is stored only in your browser’s localStorage and sent only to api.github.com. No scopes needed for public repos.',
      footer: 'no backend · no build · no tracking · ',
      replay: '🎬 Replay',
      poster: '🖼 Poster',
      record: '⏺ Record',
      stop: '⏹ Stop',
      copylink: '🔗 Copy link',
      copied: '✓ Copied!',
      copyfail: '✗ Copy failed',
      newfilm: '← New film',
      // loading stages
      st_reading: 'Reading the script…',
      st_history: (n) => 'Reading ' + n + ' year' + (n > 1 ? 's' : '') + ' of history…',
      st_casting: (n) => 'Casting ' + n + ' contributor' + (n > 1 ? 's' : '') + '…',
      st_credits: 'Rolling the end credits…',
      st_projecting: (d) => 'GitHub is preparing repository statistics… attempt ' + ((d && d.attempt) || 1) + '/' + ((d && d.attempts) || 24),
      st_cached: 'Rewinding the reels… (cached)',
      st_demo: 'Rewinding the demo reel…',
      // errors
      err_badinput: 'That does not look like a GitHub repository. Try "owner/repo" or a full github.com URL.',
      err_notfound: 'Repository not found. It may be private, renamed, or never existed. (Private repos are not supported.)',
      err_ratelimit: (when) => 'GitHub API rate limit reached. It resets at ' + when + '. Meanwhile: add a token (raises the limit to 5,000/h) or watch a demo below.',
      err_forbidden: 'GitHub said 403 Forbidden. If you entered a token, check it is valid.',
      err_empty: 'This repository has no commit history yet — nothing to film.',
      err_stats: 'GitHub is still computing statistics for this repository. This can take a minute or two the first time — try again shortly.',
      err_demo: 'Could not load the demo: ',
      err_generic: 'Something went wrong. The projector jammed.',
      err_poster: 'Poster export failed: ',
      err_record: 'Recording failed: ',
      err_norecord: 'Video recording is not supported in this browser.',
      title_lang: 'Switch language',
      title_replay: 'Replay',
      title_pause: 'Pause / play (Space)',
      title_speed: 'Playback speed',
      title_poster: 'Download poster PNG',
      title_record: 'Record the movie as video',
      title_copylink: 'Copy a shareable link',
      title_back: 'Back to start',
      film_presents: 'REPO CINEMA presents',
      film_based: (n) => 'Based on ' + fmt(n) + ' true commits',
      film_hud_commits: (n) => fmt(n) + ' commits',
      film_hud_contributors: (n) => fmt(n) + ' contributors',
      film_credits_title: (n) => '— the last ' + n + ' commits —',
      film_no_credits: 'No recent commit messages',
      film_the_end: 'THE END',
      film_tagline: 'Every repo deserves a premiere.',
      film_final_totals: (d) => fmt(d.commits) + ' commits · ' + fmt(d.contributors) + ' contributors',
      film_milestone_birth: (d) => 'In the beginning — ' + d.date,
      film_milestone_enter: (d) => 'Enter ' + d.login,
      film_milestone_peak: (d) => 'The busiest week: ' + fmt(d.commits) + ' commits',
      film_milestone_refactor: (d) => 'The great refactor: −' + fmt(d.lines) + ' lines',
      film_milestone_commit: (d) => 'Commit #' + fmt(d.commits),
      poster_presents: 'R E P O   C I N E M A   P R E S E N T S',
      poster_by_contributors: (n) => 'A film by ' + fmt(n) + ' contributors',
      poster_based: (n) => 'Based on ' + fmt(n) + ' true commits',
      poster_years: (n) => n + ' year' + (n > 1 ? 's' : '') + ' in the making',
      poster_months: (n) => n + ' month' + (n > 1 ? 's' : '') + ' in the making',
      poster_starring: (login) => 'Starring ' + login,
      poster_stars_k: (n) => '★ ' + n.toLocaleString('en-US') + 'k'
    },
    ru: {
      page_title: 'Repo Cinema — каждый репозиторий заслуживает премьеры',
      tagline: 'Каждый репозиторий заслуживает премьеры.',
      placeholder: 'github.com/owner/repo или owner/repo',
      premiere: 'Премьера ▶',
      now_showing: 'Сейчас в кино:',
      token_summary: 'Есть токен? Подними лимит',
      token_note: 'Персональный токен GitHub поднимает лимит API с 60 до 5 000 запросов в час. Он хранится только в localStorage вашего браузера и отправляется только на api.github.com. Для публичных репозиториев права (scopes) не нужны.',
      footer: 'без бэкенда · без сборки · без трекинга · ',
      replay: '🎬 Заново',
      poster: '🖼 Постер',
      record: '⏺ Запись',
      stop: '⏹ Стоп',
      copylink: '🔗 Скопировать ссылку',
      copied: '✓ Скопировано!',
      copyfail: '✗ Не скопировалось',
      newfilm: '← Новый фильм',
      st_reading: 'Читаем сценарий…',
      st_history: (n) => 'Листаем ' + n + ' ' + ruYears(n) + ' истории…',
      st_casting: (n) => 'Кастинг: ' + n + ' ' + ruPlural(n, 'контрибьютор', 'контрибьютора', 'контрибьюторов') + '…',
      st_credits: 'Готовим финальные титры…',
      st_projecting: (d) => 'GitHub считает статистику репозитория… попытка ' + ((d && d.attempt) || 1) + '/' + ((d && d.attempts) || 24),
      st_cached: 'Перематываем плёнку… (из кэша)',
      st_demo: 'Перематываем демо-плёнку…',
      err_badinput: 'Не похоже на GitHub-репозиторий. Попробуйте «owner/repo» или полную ссылку github.com.',
      err_notfound: 'Репозиторий не найден. Возможно, он приватный, переименован или никогда не существовал. (Приватные репозитории не поддерживаются.)',
      err_ratelimit: (when) => 'Достигнут лимит GitHub API. Сброс в ' + when + '. А пока: добавьте токен (поднимет лимит до 5 000/ч) или посмотрите демо ниже.',
      err_forbidden: 'GitHub ответил 403 Forbidden. Если вы вводили токен — проверьте, что он действителен.',
      err_empty: 'В этом репозитории ещё нет коммитов — снимать нечего.',
      err_stats: 'GitHub всё ещё считает статистику этого репозитория. В первый раз это может занять 1–2 минуты — попробуйте ещё раз чуть позже.',
      err_demo: 'Не удалось загрузить демо: ',
      err_generic: 'Что-то пошло не так. Проектор заело.',
      err_poster: 'Не удалось сохранить постер: ',
      err_record: 'Запись не удалась: ',
      err_norecord: 'Запись видео не поддерживается в этом браузере.',
      title_lang: 'Сменить язык',
      title_replay: 'Запустить заново',
      title_pause: 'Пауза / продолжить (Пробел)',
      title_speed: 'Скорость воспроизведения',
      title_poster: 'Скачать постер PNG',
      title_record: 'Записать фильм как видео',
      title_copylink: 'Скопировать ссылку',
      title_back: 'Вернуться к началу',
      film_presents: 'REPO CINEMA представляет',
      film_based: (n) => 'Основано на ' + fmt(n) + ' ' + ruPlural(n, 'настоящем коммите', 'настоящих коммитах', 'настоящих коммитах'),
      film_hud_commits: (n) => fmt(n) + ' ' + ruPlural(n, 'коммит', 'коммита', 'коммитов'),
      film_hud_contributors: (n) => fmt(n) + ' ' + ruPlural(n, 'контрибьютор', 'контрибьютора', 'контрибьюторов'),
      film_credits_title: (n) => '— последние ' + n + ' ' + ruPlural(n, 'коммит', 'коммита', 'коммитов') + ' —',
      film_no_credits: 'Нет свежих сообщений коммитов',
      film_the_end: 'КОНЕЦ',
      film_tagline: 'Каждый репозиторий заслуживает премьеры.',
      film_final_totals: (d) => fmt(d.commits) + ' ' + ruPlural(d.commits, 'коммит', 'коммита', 'коммитов') + ' · ' + fmt(d.contributors) + ' ' + ruPlural(d.contributors, 'контрибьютор', 'контрибьютора', 'контрибьюторов'),
      film_milestone_birth: (d) => 'В начале — ' + d.date,
      film_milestone_enter: (d) => 'На сцене ' + d.login,
      film_milestone_peak: (d) => 'Самая бурная неделя: ' + fmt(d.commits) + ' ' + ruPlural(d.commits, 'коммит', 'коммита', 'коммитов'),
      film_milestone_refactor: (d) => 'Великий рефакторинг: −' + fmt(d.lines) + ' ' + ruPlural(d.lines, 'строка', 'строки', 'строк'),
      film_milestone_commit: (d) => 'Коммит №' + fmt(d.commits),
      poster_presents: 'R E P O   C I N E M A   П Р Е Д С Т А В Л Я Е Т',
      poster_by_contributors: (n) => 'Фильм от ' + fmt(n) + ' ' + ruPlural(n, 'контрибьютора', 'контрибьюторов', 'контрибьюторов'),
      poster_based: (n) => 'Основано на ' + fmt(n) + ' ' + ruPlural(n, 'настоящем коммите', 'настоящих коммитах', 'настоящих коммитах'),
      poster_years: (n) => n + ' ' + ruYears(n) + ' в работе',
      poster_months: (n) => n + ' ' + ruPlural(n, 'месяц', 'месяца', 'месяцев') + ' в работе',
      poster_starring: (login) => 'В главной роли ' + login,
      poster_stars_k: (n) => '★ ' + n.toLocaleString('ru-RU') + ' тыс.'
    }
  };

  function ruPlural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  function ruYears(n) { return ruPlural(n, 'год', 'года', 'лет'); }

  let lang = 'en';
  try {
    lang = localStorage.getItem('rc:lang') ||
      ((navigator.language || '').toLowerCase().startsWith('ru') ? 'ru' : 'en');
  } catch (e) { /* default en */ }
  if (!DICT[lang]) lang = 'en';

  function t(key, arg) {
    const v = (DICT[lang] && DICT[lang][key]) || DICT.en[key] || key;
    return typeof v === 'function' ? v(arg) : v;
  }

  function locale() { return lang === 'ru' ? 'ru-RU' : 'en-US'; }

  function fmt(n) { return Math.round(n || 0).toLocaleString(locale()); }

  function monthYear(ts) {
    return new Date(ts).toLocaleDateString(locale(), { month: 'short', year: 'numeric' });
  }

  function getLang() { return lang; }

  function setLang(l) {
    lang = DICT[l] ? l : 'en';
    try { localStorage.setItem('rc:lang', lang); } catch (e) { /* ignore */ }
    apply();
  }

  /** Translate an ApiError (by kind) or fall back to its English message. */
  function errorText(e) {
    if (!e) return t('err_generic');
    switch (e.kind) {
      case 'notfound': return t('err_notfound');
      case 'ratelimit': return t('err_ratelimit', (e.data && e.data.when) || '—');
      case 'forbidden': return t('err_forbidden');
      case 'empty': return t('err_empty');
      case 'stats-timeout': return t('err_stats');
      default: return e.message || t('err_generic');
    }
  }

  /** Loading-stage text by status key from api.js. */
  function statusText(key, arg) { return t('st_' + key, arg); }

  /** Stamp static UI texts onto the DOM. */
  function apply() {
    document.documentElement.lang = lang;
    document.title = t('page_title');
    const set = (id, key) => { const el = document.getElementById(id); if (el) el.textContent = t(key); };
    const q = (sel, key) => { const el = document.querySelector(sel); if (el) el.textContent = t(key); };
    const title = (id, key) => { const el = document.getElementById(id); if (el) el.title = t(key); };
    q('.tagline', 'tagline');
    q('.demo-label', 'now_showing');
    q('.token-row summary', 'token_summary');
    q('.token-note', 'token_note');
    const input = document.getElementById('repo-input');
    if (input) input.placeholder = t('placeholder');
    set('premiere-btn', 'premiere');
    set('btn-replay', 'replay');
    set('btn-poster', 'poster');
    set('btn-copylink', 'copylink');
    set('btn-newfilm-label', 'newfilm');
    const back = document.getElementById('btn-back');
    if (back) back.textContent = t('newfilm');
    const rec = document.getElementById('btn-record');
    if (rec && !rec.classList.contains('recording')) rec.textContent = t('record');
    const foot = document.getElementById('footer-text');
    if (foot) foot.textContent = t('footer');
    const toggle = document.getElementById('lang-toggle');
    if (toggle) toggle.textContent = lang === 'ru' ? 'EN' : 'RU';
    title('lang-toggle', 'title_lang');
    title('btn-replay', 'title_replay');
    title('btn-pause', 'title_pause');
    title('btn-speed', 'title_speed');
    title('btn-poster', 'title_poster');
    title('btn-record', 'title_record');
    title('btn-copylink', 'title_copylink');
    title('btn-back', 'title_back');
  }

  return { t, getLang, setLang, apply, errorText, statusText, fmt, monthYear };
})();
