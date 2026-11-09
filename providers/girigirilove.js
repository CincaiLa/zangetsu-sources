// girigiriLove — Chinese-subbed anime source for Zangetsu (rewritten from scratch).
// Site: https://ani.girigirilove.com
//
// The site exposes a MacCMS-style JSON API (endpoints taken from Kazumi's
// giriGiriLove rule):
//   list/search : GET <API>/get_list?vod_name=<kw>&offset=<n>&limit=<n>
//                 -> { info: { rows: [ { vod_id, vod_name, vod_pic, ... } ] } }
//   detail      : GET <API>/get_detail?vod_id=<id>
//                 -> { info: { vod_play_from, vod_play_url, ... } }
// vod_play_from = road names joined by "$$$"; vod_play_url = roads joined by
// "$$$", episodes by "#", and each episode is "name$link".
//
// Episode links may be direct .m3u8/.mp4 files or play pages; _resolve() handles
// both. This source never calls AniList; third-party lookups (Bangumi, Jikan) are
// controlled by the switches below.

var SOURCE_ID = (typeof __SOURCE_ID !== 'undefined' && __SOURCE_ID)
  ? String(__SOURCE_ID) : 'girigirilove';

var SITE = 'https://ani.girigirilove.com';
var API = 'https://m3u8.girigirilove.com/api.php/Vod';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';
var PAGE = 24;

// Switches (edit on GitHub, then bump the version):
//  USE_BANGUMI_SEARCH: when a title finds nothing on the site, look up its Chinese
//    name on Bangumi and search again (lets Japanese/English/romaji titles match).
//  LOOKUP_MAL: when a detail page opens, work out the MyAnimeList id (Bangumi ->
//    Jikan) so Zangetsu can attach AniList/MAL metadata and sync trackers.
var USE_BANGUMI_SEARCH = true;
var LOOKUP_MAL = true;
//  DIAG: while testing, show why metadata is missing in the first episode's title.
//    Set to false once episodes show the English titles.
var DIAG = true;
//  TITLE_LANG: 'ja' shows each title as its Japanese original (looked up on Bangumi)
//    so Zangetsu can find metadata for it, like it does for AnimeCube's English
//    titles; 'zh' keeps the Chinese titles from the site. Titles Bangumi cannot
//    match exactly stay Chinese either way.
var TITLE_LANG = 'ja';

function getInfo() {
  return { name: 'girigiriLove', lang: 'zh', baseUrl: SITE,
    logo: 'https://raw.githubusercontent.com/CincaiLa/zangetsu-sources/main/icons/girigirilove.png',
    type: 'anime', version: '1.4.0' };
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
function _get(url, ref) {
  return fetch(url, { headers: { 'User-Agent': UA, 'Referer': ref || SITE + '/' } })
    .then(function (r) { return r.body || ''; })
    .catch(function () { return ''; });
}

function _json(url, ref) {
  return _get(url, ref).then(function (b) {
    try { return JSON.parse(b); } catch (e) { return null; }
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function _abs(u) {
  if (!u) return null;
  u = String(u).replace(/\\/g, '');
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (/^https?:/i.test(u)) return u;
  if (u.charAt(0) === '/') return SITE + u;
  return SITE + '/' + u;
}

function _text(s) {
  return String(s || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function _genres(s) {
  if (!s) return [];
  return String(s).split(/[,，、\/ ]+/).filter(function (x) { return x; });
}

function _rows(j) {
  return (j && j.info && j.info.rows) || [];
}

function _card(r) {
  var id = String(r.vod_id);
  var year = parseInt(r.vod_year, 10);
  return {
    id: id, title: r.vod_name || id, cover: _abs(r.vod_pic), url: id,
    type: 'anime', sourceId: SOURCE_ID,
    genres: _genres(r.vod_class), year: year || null,
    rating: parseFloat(r.vod_score) || 0, updatedAt: r.vod_time || '',
  };
}

// ── Listings ─────────────────────────────────────────────────────────────────
// Two short rows only: the app uses row[0] as the hero carousel.
function getHome(opts) {
  // Small request on purpose: this API returns every field (full synopsis too)
  // for each row, and the app gives a source only a few seconds to answer.
  return _json(API + '/get_list?offset=0&limit=12').then(function (j) {
    return _withJa(_rows(j).map(_card)).then(function (cards) {
      var rows = [
        { title: '最近更新', items: cards.slice(0, 6) },
        { title: '更多番剧', items: cards.slice(6) },
      ];
      return rows.filter(function (r) { return r.items.length; });
    });
  }).catch(function () { return []; });
}

function popular(opts) {
  return getHome(opts).then(function (rows) {
    var out = [];
    for (var i = 0; i < rows.length; i++) out = out.concat(rows[i].items);
    return out;
  });
}

// ── Search ───────────────────────────────────────────────────────────────────
function _siteSearch(q, page) {
  var url = API + '/get_list?vod_name=' + encodeURIComponent(q)
    + '&offset=' + ((page - 1) * PAGE) + '&limit=' + PAGE;
  return _json(url).then(function (j) { return _withJa(_rows(j).map(_card)); })
    .catch(function () { return []; });
}

// Bangumi lookup: title in any language -> candidate Chinese/Japanese names.
function _bgmTitles(q) {
  var u = 'https://api.bgm.tv/search/subject/' + encodeURIComponent(q)
    + '?type=2&responseGroup=small&max_results=5';
  return fetch(u, { headers: { 'User-Agent': 'zangetsu-sources/1.0 (personal use)' } })
    .then(function (r) { return r.body || ''; })
    .then(function (b) {
      var j; try { j = JSON.parse(b); } catch (e) { return []; }
      var list = (j && j.list) || [], out = [], seen = {};
      for (var i = 0; i < list.length; i++) {
        var names = [list[i].name_cn, list[i].name];
        for (var k = 0; k < names.length; k++) {
          var n = names[k] ? String(names[k]).trim() : '';
          if (n && !seen[n]) { seen[n] = 1; out.push(n); }
        }
      }
      return out;
    })
    .catch(function () { return []; });
}

// Drop "Season 2" / "2nd Season" / "Part 2" noise before the Bangumi lookup.
function _plain(q) {
  return String(q)
    .replace(/\b(\d+(st|nd|rd|th)\s+season|season\s*\d+|part\s*\d+|cour\s*\d+)\b/gi, '')
    .replace(/\s+/g, ' ').trim();
}

function _lookup(q) {
  return _bgmTitles(q).then(function (t) {
    if (t.length) return t;
    var p = _plain(q);
    return p && p !== q ? _bgmTitles(p) : [];
  });
}

function search(query, page, opts) {
  var q = String(query || '').trim();
  if (!q) return Promise.resolve([]);
  var pg = page && page > 0 ? page : 1;

  return _siteSearch(q, pg).then(function (direct) {
    if (direct.length || pg > 1 || !USE_BANGUMI_SEARCH) return direct;

    return _lookup(q).then(function (titles) {
      if (!titles.length) return [];
      var picked = titles.slice(0, 4);
      return Promise.all(picked.map(function (t) { return _siteSearch(t, 1); }))
        .then(function (groups) {
          // Best match: a result whose title equals the Bangumi title it was
          // found with; otherwise the first result of the first group.
          var best = null, a, b;
          for (a = 0; a < groups.length && !best; a++) {
            for (b = 0; b < groups[a].length; b++) {
              if (groups[a][b].title === picked[a]) { best = groups[a][b]; break; }
            }
          }
          for (a = 0; a < groups.length && !best; a++) {
            if (groups[a].length) best = groups[a][0];
          }

          var out = [], seen = {};
          if (best) {
            // Zangetsu auto-matches results to its own (Japanese/English/romaji)
            // title by similarity; a Chinese title never resembles it. List the
            // best match under the query's own title so it is picked up.
            var top = {};
            for (var key in best) top[key] = best[key];
            top.altTitle = best.title;
            top.title = q;
            seen[best.id] = 1;
            out.push(top);
          }
          for (a = 0; a < groups.length; a++) {
            for (b = 0; b < groups[a].length; b++) {
              var c = groups[a][b];
              if (!seen[c.id]) { seen[c.id] = 1; out.push(c); }
            }
          }
          return out;
        });
    });
  });
}

// ── Detail + episodes ────────────────────────────────────────────────────────
function _roads(info) {
  var names = String(info.vod_play_from || '').split('$$$');
  var lists = String(info.vod_play_url || '').split('$$$');
  var roads = [];
  for (var i = 0; i < lists.length; i++) {
    var eps = lists[i].split('#').filter(function (x) { return x; }).map(function (e) {
      var k = e.indexOf('$');
      return k < 0 ? { name: '', url: e } : { name: e.slice(0, k), url: e.slice(k + 1) };
    });
    if (eps.length) roads.push({ name: names[i] || ('线路' + (i + 1)), eps: eps });
  }
  return roads;
}

function _info(id) {
  return _json(API + '/get_detail?vod_id=' + encodeURIComponent(id)).then(function (j) {
    if (!j || !j.info) throw new Error('girigiriLove: no detail for ' + id);
    return j.info;
  });
}

function getDetail(url, opts) {
  var id = String(url);
  return _info(id).then(function (info) {
    var roads = _roads(info);
    // The road with the most episodes is the episode list shown in the app.
    var main = roads.slice().sort(function (a, b) { return b.eps.length - a.eps.length; })[0];
    var episodes = [];
    if (main) {
      for (var k = 0; k < main.eps.length; k++) {
        var n = k + 1;
        episodes.push({ id: id + '-' + n, number: n,
          title: main.eps[k].name || ('Episode ' + n),
          url: 'girigiri://' + id + '|' + k });
      }
    }
    var year = parseInt(info.vod_year, 10);
    var d = {
      id: id, title: info.vod_name || id, englishTitle: null,
      cover: _abs(info.vod_pic), url: id,
      description: _text(info.vod_content || info.vod_blurb),
      status: 'unknown', genres: _genres(info.vod_class), studios: [], type: 'anime',
      sourceId: SOURCE_ID, year: year || null, malId: null,
      episodes: episodes, subCount: episodes.length, dubCount: 0,
    };
    var zh = d.title;
    return _jaTitle(zh).then(function (jt) {
      return _metaFor(zh, d.year).then(function (m) {
        if (m) {
          d.malId = m.malId;
          d.anilistId = m.anilistId || null;
          d.englishTitle = m.english || m.romaji || null;
        }
        var hit = _applyEpisodes(d.episodes, m);
        if (DIAG && d.episodes.length && !hit) {
          d.episodes[0].title = m ? '诊断: MAL ' + m.malId + ' 没有AniZip剧集' : '诊断: 没查到MAL编号';
        }
        if (jt && jt !== zh) { d.zhTitle = zh; d.title = jt; }
        return d;
      });
    });
  });
}

// ── MyAnimeList id (Chinese title -> Bangumi Japanese title -> Jikan) ────────
var _malCache = {};

function _withTimeout(p, ms) {
  if (typeof setTimeout !== 'function') return p;
  return new Promise(function (resolve) {
    var done = false;
    setTimeout(function () { if (!done) { done = true; resolve(null); } }, ms);
    p.then(function (v) { if (!done) { done = true; resolve(v); } },
      function () { if (!done) { done = true; resolve(null); } });
  });
}

function _getJson(u) {
  return fetch(u, { headers: { 'User-Agent': 'zangetsu-sources/1.2 (personal use)' } })
    .then(function (r) { return r.body || ''; })
    .then(function (b) { try { return JSON.parse(b); } catch (e) { return null; } })
    .catch(function () { return null; });
}

function _malLookup(cn, year) {
  var bu = 'https://api.bgm.tv/search/subject/' + encodeURIComponent(cn)
    + '?type=2&responseGroup=small&max_results=5';
  return _getJson(bu).then(function (j) {
    var list = (j && j.list) || [], jp = null, i;
    for (i = 0; i < list.length; i++) {
      if (list[i].name_cn === cn && list[i].name) { jp = list[i].name; break; }
    }
    if (!jp && list.length && list[0].name) jp = list[0].name;
    if (!jp) return null;
    var ju = 'https://api.jikan.moe/v4/anime?limit=10&q=' + encodeURIComponent(jp);
    return _getJson(ju).then(function (r) {
      var data = (r && r.data) || [], pick = null, k;
      // Only accept a certain match: the exact Japanese title, or a result from the
      // same year as the site's entry. A wrong id is worse than none.
      for (k = 0; k < data.length; k++) {
        if (data[k].title_japanese === jp) { pick = data[k]; break; }
      }
      if (!pick && year) {
        for (k = 0; k < data.length; k++) {
          var y = data[k].year || (data[k].aired && data[k].aired.prop && data[k].aired.prop.from
            && data[k].aired.prop.from.year);
          if (y === year) { pick = data[k]; break; }
        }
      }
      if (!pick || !pick.mal_id) return null;
      return { malId: pick.mal_id, english: pick.title_english || null, romaji: pick.title || null };
    });
  });
}

// Episode titles / dates / thumbnails from AniZip (keyed by MAL id).
function _metaLookup(cn, year) {
  return _malLookup(cn, year).then(function (m) {
    if (!m) return null;
    return _getJson('https://api.ani.zip/mappings?mal_id=' + encodeURIComponent(m.malId)).then(function (z) {
      m.anilistId = (z && z.mappings && z.mappings.anilist_id) || null;
      m.eps = (z && z.episodes) || {};
      return m;
    });
  });
}

function _metaFor(cn, year) {
  if (!LOOKUP_MAL || !cn) return Promise.resolve(null);
  if (_malCache.hasOwnProperty(cn)) return Promise.resolve(_malCache[cn]);
  return _withTimeout(_metaLookup(cn, year), 8000).then(function (m) {
    if (m) _malCache[cn] = m;
    return m;
  }).catch(function () { return null; });
}

function _pickTitle(t) {
  if (!t) return null;
  if (typeof t === 'string') return t;
  return t.en || t['x-jat'] || t.ja || t.zh || null;
}

// Copy AniZip's per-episode data onto our episodes by episode number.
function _applyEpisodes(episodes, m) {
  if (!m || !m.eps) return 0;
  var hit = 0;
  for (var i = 0; i < episodes.length; i++) {
    var z = m.eps[String(episodes[i].number)];
    if (!z) continue;
    var title = _pickTitle(z.title);
    if (!title) continue;
    var e = episodes[i];
    e.title = title;
    var img = z.image || null, text = z.overview || z.summary || null;
    var air = z.airdate || z.airDate || z.airDateUtc || null;
    var len = z.runtime || z.length || null;
    if (img) { e.thumbnail = img; e.image = img; }
    if (text) { e.description = text; e.overview = text; }
    if (air) { e.airDate = air; }
    if (len) { e.duration = len; }
    if (z.rating) { e.rating = parseFloat(z.rating) || null; }
    hit++;
  }
  return hit;
}

// ── Japanese titles (so Zangetsu can look the show up) ───────────────────────
var _jaCache = {};

function _norm(s) {
  return String(s || '').replace(/[\s·・:：!！?？,，。、~～\-—_]/g, '').toLowerCase();
}

// Chinese site title -> Japanese original, only on an exact (normalized) name_cn match.
function _jaTitle(cn) {
  if (TITLE_LANG !== 'ja' || !cn) return Promise.resolve(cn);
  if (_jaCache.hasOwnProperty(cn)) return Promise.resolve(_jaCache[cn]);
  var u = 'https://api.bgm.tv/search/subject/' + encodeURIComponent(cn)
    + '?type=2&responseGroup=small&max_results=5';
  return _getJson(u).then(function (j) {
    var list = (j && j.list) || [], want = _norm(cn), jp = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].name && _norm(list[i].name_cn) === want) { jp = list[i].name; break; }
    }
    if (j) _jaCache[cn] = jp || cn;
    return jp || cn;
  });
}

function _withJa(cards) {
  if (TITLE_LANG !== 'ja' || !cards.length) return Promise.resolve(cards);
  return _withTimeout(Promise.all(cards.map(function (c) { return _jaTitle(c.title); })), 6000)
    .then(function (titles) {
      if (!titles) return cards;
      return cards.map(function (c, i) {
        if (!titles[i] || titles[i] === c.title) return c;
        var o = {};
        for (var k in c) o[k] = c[k];
        o.zhTitle = c.title;
        o.title = titles[i];
        return o;
      });
    });
}
