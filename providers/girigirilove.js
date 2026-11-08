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
// both. This source never calls AniList. The only third-party request it makes is
// a Bangumi lookup (search only) to turn a Japanese/English/romaji title into the
// Chinese title this site uses.

var SOURCE_ID = (typeof __SOURCE_ID !== 'undefined' && __SOURCE_ID)
  ? String(__SOURCE_ID) : 'girigirilove';

var SITE = 'https://ani.girigirilove.com';
var API = 'https://m3u8.girigirilove.com/api.php/Vod';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';
var PAGE = 24;

function getInfo() {
  return { name: 'girigiriLove', lang: 'zh', baseUrl: SITE,
    logo: SITE + '/favicon.ico', type: 'anime', version: '1.0.2' };
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
// DIAGNOSTIC BUILD: instead of the real home page, show what the app's own
// network layer gets back from the site's API. Each test becomes a card whose
// title is the result. Search / detail / playback are unchanged.
function _probe(label, url, headers) {
  var t0 = Date.now();
  var p;
  try { p = fetch(url, headers ? { headers: headers } : {}); }
  catch (e) { return Promise.resolve({ label: label, err: String((e && e.message) || e), ms: 0 }); }
  return p.then(function (r) {
    var body = r && r.body != null ? String(r.body) : '';
    var rows = null, firstId = null;
    try {
      var j = JSON.parse(body);
      var list = (j && j.info && j.info.rows) || null;
      if (list) { rows = list.length; if (list[0]) firstId = list[0].vod_id; }
    } catch (e) {}
    return { label: label, status: (r && r.status !== undefined) ? r.status : '?',
      len: body.length, rows: rows, firstId: firstId,
      head: body.slice(0, 60).replace(/\s+/g, ' '), ms: Date.now() - t0 };
  }).catch(function (e) {
    return { label: label, err: String((e && e.message) || e), ms: Date.now() - t0 };
  });
}

function _dbgCards(res) {
  var line = res.err
    ? res.label + ' 失败 ' + res.ms + 'ms ' + String(res.err).slice(0, 40)
    : res.label + ' 状态' + res.status + ' ' + (res.rows === null ? '非列表' : res.rows + '行')
      + ' ' + res.len + '字节 ' + res.ms + 'ms';
  var out = [{ id: 'dbg-' + res.label, title: line, cover: null, url: 'dbg', type: 'anime', sourceId: SOURCE_ID }];
  if (!res.err) out.push({ id: 'dbg-' + res.label + 'h', title: res.label + ' 内容: ' + res.head,
    cover: null, url: 'dbg', type: 'anime', sourceId: SOURCE_ID });
  return out;
}

function getHome(opts) {
  var q = encodeURIComponent('黑色五叶草');
  var H = { 'User-Agent': UA, 'Referer': SITE + '/' };
  return Promise.all([
    _probe('A无头搜索', API + '/get_list?vod_name=' + q + '&offset=0&limit=24', null),
    _probe('B有头搜索', API + '/get_list?vod_name=' + q + '&offset=0&limit=24', H),
    _probe('C无关键词', API + '/get_list?offset=0&limit=12', null),
  ]).then(function (res) {
    var id = res[0].firstId || res[2].firstId;
    return _probe('D详情', API + '/get_detail?vod_id=' + encodeURIComponent(id || 1), null)
      .then(function (d) { res.push(d); return res; });
  }).then(function (res) {
    var items = [];
    for (var i = 0; i < res.length; i++) items = items.concat(_dbgCards(res[i]));
    return [
      { title: '诊断 1', items: items.slice(0, 4) },
      { title: '诊断 2', items: items.slice(4) },
    ].filter(function (r) { return r.items.length; });
  }).catch(function (e) {
    return [{ title: '诊断失败', items: [{ id: 'dbg-x', title: String((e && e.message) || e),
      cover: null, url: 'dbg', type: 'anime', sourceId: SOURCE_ID }] }];
  });
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
  return _json(url).then(function (j) { return _rows(j).map(_card); })
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
    if (direct.length || pg > 1) return direct;

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
    return {
      id: id, title: info.vod_name || id, englishTitle: null,
      cover: _abs(info.vod_pic), url: id,
      description: _text(info.vod_content || info.vod_blurb),
      status: 'unknown', genres: _genres(info.vod_class), studios: [], type: 'anime',
      sourceId: SOURCE_ID, year: year || null, malId: null,
      episodes: episodes, subCount: episodes.length, dubCount: 0,
    };
  });
}

function getEpisodes(url, opts) {
  return getDetail(url, opts).then(function (d) { return d.episodes; });
}

// ── Streams ──────────────────────────────────────────────────────────────────
function getVideoSources(episodeUrl) {
  var raw = String(episodeUrl).replace('girigiri://', '');
  var cut = raw.indexOf('|');
  if (cut < 0) return Promise.reject(new Error('girigiriLove: bad episode url'));
  var id = raw.slice(0, cut);
  var idx = parseInt(raw.slice(cut + 1), 10);

  return _info(id).then(function (info) {
    var roads = _roads(info);
    var jobs = [];
    for (var i = 0; i < roads.length; i++) {
      var ep = roads[i].eps[idx];
      if (ep && ep.url) jobs.push(_resolve(ep.url, 0));
    }
    return Promise.all(jobs).then(function (groups) {
      var out = [], seen = {};
      for (var a = 0; a < groups.length; a++) {
        for (var b = 0; b < groups[a].length; b++) {
          var s = groups[a][b];
          if (!seen[s.url]) { seen[s.url] = 1; out.push(s); }
        }
      }
      if (!out.length) throw new Error('girigiriLove: no playable sources');
      return out;
    });
  });
}

function _isMedia(u) {
  return /\.(m3u8|mp4)(\?|#|$)/i.test(String(u));
}

function _source(u) {
  return { url: u, quality: 'auto', container: /\.m3u8/i.test(u) ? 'hls' : 'mp4',
    headers: { 'User-Agent': UA, 'Referer': SITE + '/' },
    kind: 'sub', audioLang: 'ja', subtitles: [] };
}

// Direct media links are used as-is; anything else is a page to search for a
// stream (at most two hops).
function _resolve(raw, depth) {
  var u = _abs(raw);
  if (!u) return Promise.resolve([]);
  if (_isMedia(u)) return Promise.resolve([_source(u)]);
  if (depth > 1) return Promise.resolve([]);

  return _get(u, SITE + '/').then(function (html) {
    html = String(html || '');
    var viaVar = _playerUrl(html);
    if (viaVar) {
      var next = _abs(viaVar);
      if (next && _isMedia(next)) return [_source(next)];
      if (next) return _resolve(next, depth + 1);
    }
    var m = html.match(/https?:\\?\/\\?\/[^"'\s<>]+?\.(?:m3u8|mp4)[^"'\s<>]*/);
    if (m) {
      var link = _abs(m[0]);
      if (link) return [_source(link)];
    }
    return [];
  }).catch(function () { return []; });
}

// MacCMS play pages define `var player_xxxx = {..., "url": "...", "encrypt": 0|1|2}`.
function _playerUrl(html) {
  var m = html.match(/var\s+player_\w+\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
  if (!m) return null;
  var o;
  try { o = JSON.parse(m[1]); } catch (e) { return null; }
  if (!o || !o.url) return null;
  return _decode(o.url, o.encrypt);
}

var _ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function _base64(s) {
  s = String(s).replace(/[^A-Za-z0-9+\/]/g, '');
  var out = '', bits = 0, val = 0;
  for (var i = 0; i < s.length; i++) {
    val = (val << 6) | _ALPHABET.indexOf(s.charAt(i));
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((val >> bits) & 255);
      val &= (1 << bits) - 1;
    }
  }
  return out;
}

function _unescape(s) {
  return typeof unescape === 'function' ? unescape(s) : decodeURIComponent(s);
}

function _decode(url, encrypt) {
  var e = parseInt(encrypt, 10) || 0;
  try {
    if (e === 1) return _unescape(String(url));
    if (e === 2) return _unescape(_base64(url));
  } catch (err) { /* use the raw value */ }
  return String(url);
}
