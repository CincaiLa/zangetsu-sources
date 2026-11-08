// girigiriLove — Chinese-subbed anime source. Site: https://ani.girigirilove.com
//
// DRAFT (untested). Endpoints and field names come from Kazumi's giriGiriLove
// rule (api 9): a MacCMS-style JSON API
//   list/search : GET <API>/get_list?vod_name=<kw>&offset=<n>&limit=24
//                 -> { info: { rows: [ { vod_id, vod_name, ... } ] } }
//   detail      : GET <API>/get_detail?vod_id=<id>
//                 -> { info: { vod_play_from, vod_play_url, ... } }
// vod_play_from  = road names joined by "$$$"
// vod_play_url   = roads joined by "$$$", episodes by "#", "name$url" per episode
//
// Kazumi loads the episode URL in a webview to sniff the real stream, so the
// episode "url" is probably a play PAGE, not a direct m3u8. _resolve() handles
// both: direct media links are used as-is; pages are fetched and searched for a
// MacCMS `player_xxxx` variable or a bare .m3u8/.mp4 link.

var SOURCE_ID = (typeof __SOURCE_ID !== 'undefined' && __SOURCE_ID)
  ? String(__SOURCE_ID) : 'girigirilove';

var SITE = 'https://ani.girigirilove.com';
var API = 'https://m3u8.girigirilove.com/api.php/Vod';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';
var PAGE_SIZE = 24;

function getInfo() {
  return { name: 'girigiriLove', lang: 'zh', baseUrl: SITE,
    logo: SITE + '/favicon.ico', type: 'anime', version: '0.2.2' };
}

function _get(url, ref) {
  return fetch(url, { headers: { 'User-Agent': UA, 'Referer': ref || SITE + '/' } })
    .then(function (r) { return r.body || ''; }).catch(function () { return ''; });
}
function _json(url, ref) {
  return _get(url, ref).then(function (b) {
    try { return JSON.parse(b); } catch (e) { return null; }
  });
}

// ── helpers ──────────────────────────────────────────────────────────────────
function _abs(u) {
  if (!u) return null;
  u = String(u).replace(/\\/g, '');
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (/^https?:/i.test(u)) return u;
  if (u.charAt(0) === '/') return SITE + u;
  return SITE + '/' + u;
}

function _strip(s) {
  return String(s || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function _genres(s) {
  if (!s) return [];
  return String(s).split(/[,，、\/ ]+/).filter(function (x) { return x; });
}

function _card(r) {
  var id = String(r.vod_id);
  var year = r.vod_year ? parseInt(r.vod_year, 10) : null;
  return {
    id: id, title: r.vod_name || id, cover: _abs(r.vod_pic), url: id,
    type: 'anime', sourceId: SOURCE_ID,
    genres: _genres(r.vod_class), year: year || null,
    rating: parseFloat(r.vod_score) || 0, updatedAt: r.vod_time || '',
  };
}

function _rows(j) {
  return (j && j.info && j.info.rows) || [];
}

// ── Listings ─────────────────────────────────────────────────────────────────
function getHome(opts) {
  return _json(API + '/get_list?offset=0&limit=' + (PAGE_SIZE * 2)).then(function (j) {
    var cards = _rows(j).map(_card);
    if (!cards.length) return [];
    // The app uses row[0] as the hero carousel, so give it a second row too.
    var rows = [
      { title: '最近更新', items: cards.slice(0, PAGE_SIZE) },
      { title: '更多番剧', items: cards.slice(PAGE_SIZE) },
    ];
    return rows.filter(function (r) { return r.items.length; });
  }).catch(function () { return []; });
}

function popular(opts) {
  return getHome(opts).then(function (rows) {
    var seen = {}, out = [];
    for (var i = 0; i < rows.length; i++) {
      var items = rows[i].items;
      for (var j = 0; j < items.length; j++) {
        if (!seen[items[j].id]) { seen[items[j].id] = 1; out.push(items[j]); }
      }
    }
    return out;
  });
}

// Search the site's own API. Titles on this site are Chinese, so a romaji or
// English query (what Zangetsu usually sends) finds nothing directly. When the
// direct search is empty we look the title up on Bangumi (bgm.tv) to get its
// Chinese name, then search the site with that.
function _siteSearch(q, p) {
  var url = API + '/get_list?vod_name=' + encodeURIComponent(q)
    + '&offset=' + ((p - 1) * PAGE_SIZE) + '&limit=' + PAGE_SIZE;
  return _json(url).then(function (j) { return _rows(j).map(_card); })
    .catch(function () { return []; });
}

// Drop "Season 2" / "2nd Season" / "Part 2" noise that hurts title matching.
function _cleanQuery(q) {
  return String(q)
    .replace(/\b(\d+(st|nd|rd|th)\s+season|season\s*\d+|part\s*\d+|cour\s*\d+)\b/gi, '')
    .replace(/\s+/g, ' ').trim();
}

function _bgmTitles(q) {
  var u = 'https://api.bgm.tv/search/subject/' + encodeURIComponent(q)
    + '?type=2&responseGroup=small&max_results=5';
  return fetch(u, { headers: { 'User-Agent': 'zangetsu-sources/0.2 (personal use)' } })
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
    }).catch(function () { return []; });
}

function _chineseTitles(q) {
  return _bgmTitles(q).then(function (t) {
    if (t.length) return t;
    var c = _cleanQuery(q);
    return c && c !== q ? _bgmTitles(c) : [];
  });
}

function search(query, page, opts) {
  var q = String(query || '').trim();
  if (!q) return Promise.resolve([]);
  var p = page && page > 0 ? page : 1;
  return _siteSearch(q, p).then(function (direct) {
    if (direct.length || p > 1) return direct;
    return _chineseTitles(q).then(function (titles) {
      if (!titles.length) return [];
      var jobs = titles.slice(0, 4).map(function (t) { return _siteSearch(t, 1); });
      return Promise.all(jobs).then(function (arrs) {
        // Pick the most likely match: a result whose title equals the Bangumi
        // title it was found with, else the first result of the first hit.
        var best = null, a, b;
        for (a = 0; a < arrs.length && !best; a++) {
          for (b = 0; b < arrs[a].length; b++) {
            if (arrs[a][b].title === titles[a]) { best = arrs[a][b]; break; }
          }
        }
        for (a = 0; a < arrs.length && !best; a++) {
          if (arrs[a].length) best = arrs[a][0];
        }
        var out = [], seen = {};
        if (best) {
          // Zangetsu auto-matches results by title similarity, and a Chinese
          // title never resembles the Japanese/English/romaji title it searched
          // with. Show the best match under the query's own title so it is
          // picked automatically; keep the real title in altTitle.
          var top = {}; for (var k in best) top[k] = best[k];
          top.altTitle = best.title;
          top.title = q;
          seen[best.id] = 1; out.push(top);
        }
        for (a = 0; a < arrs.length; a++) {
          for (b = 0; b < arrs[a].length; b++) {
            var c = arrs[a][b];
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
  var from = String(info.vod_play_from || '').split('$$$');
  var urls = String(info.vod_play_url || '').split('$$$');
  var roads = [];
  for (var i = 0; i < urls.length; i++) {
    var eps = urls[i].split('#').filter(function (x) { return x; }).map(function (e) {
      var k = e.indexOf('$');
      return k < 0 ? { name: '', url: e } : { name: e.slice(0, k), url: e.slice(k + 1) };
    });
    if (eps.length) roads.push({ name: from[i] || ('线路' + (i + 1)), eps: eps });
  }
  return roads;
}

function _fetchInfo(id) {
  return _json(API + '/get_detail?vod_id=' + encodeURIComponent(id)).then(function (j) {
    if (!j || !j.info) throw new Error('girigiriLove: no detail for ' + id);
    return j.info;
  });
}

function getDetail(url, opts) {
  var id = String(url);
  return _fetchInfo(id).then(function (info) {
    var roads = _roads(info);
    // Use the road with the most episodes as the episode list.
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
    var year = info.vod_year ? parseInt(info.vod_year, 10) : null;
    return {
      id: id, title: info.vod_name || id, englishTitle: null,
      cover: _abs(info.vod_pic), url: id,
      description: _strip(info.vod_content || info.vod_blurb) || '',
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

  return _fetchInfo(id).then(function (info) {
    var roads = _roads(info);
    var jobs = [];
    for (var i = 0; i < roads.length; i++) {
      var ep = roads[i].eps[idx];
      if (ep && ep.url) jobs.push(_resolve(ep.url, 0));
    }
    return Promise.all(jobs).then(function (arrs) {
      var out = [], seen = {};
      for (var a = 0; a < arrs.length; a++) {
        var list = arrs[a] || [];
        for (var b = 0; b < list.length; b++) {
          if (!seen[list[b].url]) { seen[list[b].url] = 1; out.push(list[b]); }
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

function _src(u) {
  return { url: u, quality: 'auto', container: /\.m3u8/i.test(u) ? 'hls' : 'mp4',
    headers: { 'User-Agent': UA, 'Referer': SITE + '/' },
    kind: 'sub', audioLang: 'ja', subtitles: [] };
}

// Turn an episode link into playable sources. Direct media links are used as-is;
// anything else is treated as a page and searched for a stream (max 2 hops).
function _resolve(raw, depth) {
  var u = _abs(raw);
  if (!u) return Promise.resolve([]);
  if (_isMedia(u)) return Promise.resolve([_src(u)]);
  if (depth > 1) return Promise.resolve([]);
  return _get(u, SITE + '/').then(function (html) {
    html = String(html || '');
    var fromVar = _fromPlayerVar(html);
    if (fromVar) {
      var next = _abs(fromVar);
      if (next && _isMedia(next)) return [_src(next)];
      if (next) return _resolve(next, depth + 1);
    }
    var m = html.match(/https?:\\?\/\\?\/[^"'\s<>]+?\.(?:m3u8|mp4)[^"'\s<>]*/);
    if (m) {
      var link = _abs(m[0]);
      if (link) return [_src(link)];
    }
    return [];
  }).catch(function () { return []; });
}

// MacCMS play pages define `var player_aaaa={..., "url":"...", "encrypt":0|1|2}`.
function _fromPlayerVar(html) {
  var m = html.match(/var\s+player_\w+\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
  if (!m) return null;
  var o;
  try { o = JSON.parse(m[1]); } catch (e) { return null; }
  if (!o || !o.url) return null;
  return _decode(o.url, o.encrypt);
}

var _B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function _b64(s) {
  s = String(s).replace(/[^A-Za-z0-9+\/]/g, '');
  var out = '', bits = 0, val = 0;
  for (var i = 0; i < s.length; i++) {
    val = (val << 6) | _B64.indexOf(s.charAt(i));
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((val >> bits) & 255);
      val &= (1 << bits) - 1;
    }
  }
  return out;
}

function _unesc(s) {
  return typeof unescape === 'function' ? unescape(s) : decodeURIComponent(s);
}

function _decode(url, encrypt) {
  var e = parseInt(encrypt, 10) || 0;
  try {
    if (e === 1) return _unesc(String(url));
    if (e === 2) return _unesc(_b64(url));
  } catch (err) { /* fall through */ }
  return String(url);
}
