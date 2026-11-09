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
// both. This source only talks to girigirilove (no AniList, no Bangumi).

var SOURCE_ID = (typeof __SOURCE_ID !== 'undefined' && __SOURCE_ID)
  ? String(__SOURCE_ID) : 'girigirilove';

var SITE = 'https://ani.girigirilove.com';
var API = 'https://m3u8.girigirilove.com/api.php/Vod';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';
var PAGE = 24;

function getInfo() {
  return { name: 'girigiriLove', lang: 'zh', baseUrl: SITE,
    logo: 'https://raw.githubusercontent.com/CincaiLa/zangetsu-sources/main/icons/girigirilove.png',
    type: 'anime', version: '1.5.1' };
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
    var cards = _rows(j).map(_card);
    var rows = [
      { title: '最近更新', items: cards.slice(0, 6) },
      { title: '更多番剧', items: cards.slice(6) },
    ];
    return rows.filter(function (r) { return r.items.length; });
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
  return _json(url).then(function (j) { return _rows(j).map(_card); })
    .catch(function () { return []; });
}

// Search the site's own API with the title exactly as given. Titles on this site
// are Chinese, so Chinese keywords are what match.
function search(query, page, opts) {
  var q = String(query || '').trim();
  if (!q) return Promise.resolve([]);
  var pg = page && page > 0 ? page : 1;
  return _siteSearch(q, pg);
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
