
// GirigiriLove — Zangetsu anime provider
// Adapted from Predidit/KazumiRules giriGiriLove.json

var SOURCE_ID = (typeof __SOURCE_ID !== 'undefined' && __SOURCE_ID)
  ? String(__SOURCE_ID) : 'girigirilove';

var SITE = 'https://ani.girigirilove.com';
var API = 'https://m3u8.girigirilove.com/api.php/Vod/';
var PLAYER = 'https://pl.girigirilove.com/addons/aplyer/atom.php';

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function getInfo() {
  return {
    name: 'GirigiriLove',
    lang: 'zh',
    baseUrl: SITE,
    logo: SITE + '/favicon.ico',
    type: 'anime',
    version: '1.0.0'
  };
}

// ── HTTP ────────────────────────────────────────────────────────────────────

function _headers(ref) {
  return {
    'User-Agent': UA,
    'Referer': ref || SITE + '/'
  };
}

function _get(url, ref) {
  return fetch(url, { headers: _headers(ref) })
    .then(function (r) {
      return r.body || '';
    });
}

function _json(url, ref) {
  return _get(url, ref).then(function (body) {
    try {
      return JSON.parse(body || 'null');
    } catch (e) {
      throw new Error('GirigiriLove: invalid API response');
    }
  });
}

function _str(v) {
  return v == null ? '' : String(v);
}

function _clean(s) {
  return htmlText(String(s || '').replace(/<[^>]*>/g, ''))
    .replace(/^\s+|\s+$/g, '');
}

function _first(v) {
  return Array.isArray(v) ? (v[0] || {}) : (v || {});
}

function _rows(json) {
  var info = json && json.info;
  if (!info) return [];
  if (Array.isArray(info.rows)) return info.rows;
  if (Array.isArray(info)) return info;
  if (info.vod_id != null) return [info];
  return [];
}

function _cover(row) {
  var p = _str(row.vod_pic || row.vod_pic_thumb || '');
  if (p && p.indexOf('//') === 0) return 'https:' + p;
  return p || null;
}

function _item(row) {
  var id = _str(row.vod_id);
  var title = _clean(row.vod_name || row.vod_en || id);

  return {
    id: id,
    title: title,
    englishTitle: _clean(row.vod_en || row.vod_name || id),
    cover: _cover(row),
    url: id,
    type: 'anime',
    sourceId: SOURCE_ID,
    description: _clean(row.vod_blurb || row.vod_content || ''),
    year: _str(row.vod_year || '') || null,
    status: _clean(row.vod_remarks || '')
  };
}

// ── Search ──────────────────────────────────────────────────────────────────

function search(query, page, opts) {
  var q = String(query || '').trim();
  if (!q) return Promise.resolve([]);

  var p = Math.max(1, parseInt(page || 1, 10) || 1);
  var offset = (p - 1) * 24;

  var url = API + 'get_list?vod_name=' + encodeURIComponent(q)
    + '&offset=' + offset + '&limit=24';

  return _json(url, SITE + '/')
    .then(function (json) {
      return _rows(json).map(_item);
    })
    .catch(function () {
      return [];
    });
}

// ── Popular + Home ──────────────────────────────────────────────────────────

// Fetch the site's catalogue without a search keyword.
function popular(opts) {
  var page = 1;

  if (opts && typeof opts.page === 'number') {
    page = Math.max(1, opts.page);
  }

  var offset = (page - 1) * 24;

  var url = API + 'get_list?offset=' + offset
    + '&limit=24';

  return _json(url, SITE + '/')
    .then(function (json) {
      return _rows(json).map(_item);
    })
    .catch(function (e) {
      console.log('GirigiriLove popular error: ' + e);
      return [];
    });
}

// Zangetsu home page.
function getHome(opts) {
  return popular(opts).then(function (items) {
    if (!items.length) return [];

    return [{
      title: '最新动漫',
      items: items
    }];
  });
}

// ── Detail + Episodes ───────────────────────────────────────────────────────

function _splitPlaySources(info) {
  var names = _str(info.vod_play_from || '').split('$$$');
  var lists = _str(info.vod_play_url || '').split('$$$');

  var out = [];

  for (var i = 0; i < lists.length; i++) {
    var routeName = _clean(names[i] || ('线路 ' + (i + 1)));
    var entries = lists[i].split('#');

    for (var j = 0; j < entries.length; j++) {
      var raw = entries[j];
      if (!raw) continue;

      var at = raw.indexOf('$');
      var epName = at >= 0
        ? raw.substring(0, at)
        : ('第' + (j + 1) + '集');

      var epUrl = at >= 0
        ? raw.substring(at + 1)
        : raw;

      epUrl = String(epUrl || '').trim();
      if (!epUrl) continue;

      out.push({
        id: String(i) + ':' + String(j),
        number: j + 1,
        title: _clean(epName) || ('Episode ' + (j + 1)),
        url: 'girigirilove://' + encodeURIComponent(routeName)
          + '/' + encodeURIComponent(epUrl)
      });
    }
  }

  return out;
}

function getDetail(url, opts) {
  var id = String(url || '').trim();
  if (!id) return Promise.resolve(null);

  return _json(
    API + 'get_detail?vod_id=' + encodeURIComponent(id),
    SITE + '/'
  ).then(function (json) {
    var info = _first(json && json.info);
    var row = _rows(json)[0] || info;
    var eps = _splitPlaySources(info);

    return {
      id: _str(info.vod_id || id),
      title: _clean(info.vod_name || row.vod_name || id),
      englishTitle: _clean(
        info.vod_en || info.vod_name || row.vod_name || id
      ),
      url: _str(info.vod_id || id),
      cover: _cover(info) || _cover(row),
      description: _clean(
        info.vod_content || info.vod_blurb || ''
      ),
      status: _clean(info.vod_remarks || ''),
      year: _str(info.vod_year || '') || null,
      genres: _str(info.vod_class || '')
        .split(/[，,、]/).filter(Boolean),
      type: 'anime',
      sourceId: SOURCE_ID,
      episodes: eps
    };
  });
}

function getEpisodes(url, opts) {
  return getDetail(url, opts).then(function (d) {
    return d && d.episodes ? d.episodes : [];
  });
}

// ── Player URL ──────────────────────────────────────────────────────────────

function _decodeEpisodeUrl(value) {
  var s = String(value || '').replace(/^girigirilove:\/\//, '');

  // Remove the route name, retaining the original episode URL.
  var slash = s.indexOf('/');
  if (slash >= 0) {
    s = s.substring(slash + 1);
  }

  try {
    return decodeURIComponent(s);
  } catch (e) {
    return s;
  }
}

function _absolute(url, base) {
  var u = String(url || '').trim();
  if (!u) return '';

  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;

  if (u.charAt(0) === '/') {
    var origin = (String(base).match(/^https?:\/\/[^/]+/i) || [''])[0];
    return origin + u;
  }

  return String(base || '') + '/' + u;
}

function _extractPlayable(body, base) {
  var text = String(body || '');
  var found = [];
  var seen = {};

  var patterns = [
    /https?:\\?\/\\?\/[^"'\\\s<>]+?\.m3u8(?:\?[^"'\\\s<>]*)?/ig,
    /https?:\\?\/\\?\/[^"'\\\s<>]+?\.mp4(?:\?[^"'\\\s<>]*)?/ig,
    /(?:file|url|src)\s*[:=]\s*["']([^"']+)["']/ig
  ];

  for (var p = 0; p < patterns.length; p++) {
    var m;

    while ((m = patterns[p].exec(text)) !== null) {
      var candidate = (m[1] || m[0])
        .replace(/\\\//g, '/')
        .replace(/&amp;/g, '&');

      candidate = _absolute(candidate, base);

      if (/^https?:\/\//i.test(candidate) && !seen[candidate]) {
        seen[candidate] = 1;
        found.push(candidate);
      }
    }
  }

  return found;
}

// ── Video Sources ───────────────────────────────────────────────────────────

function _makeStreams(urls, ref) {
  return urls.map(function (u, i) {
    return {
      url: u,
      quality: i === 0 ? 'auto' : 'source ' + (i + 1),
      container: /\.m3u8(\?|$)/i.test(u) ? 'hls' : 'mp4',
      headers: _headers(ref),
      kind: 'sub'
    };
  });
}

function getVideoSources(episodeUrl) {
  var target = _decodeEpisodeUrl(episodeUrl);

  if (!target) {
    return Promise.reject(
      new Error('GirigiriLove: empty episode URL')
    );
  }

  var url = PLAYER + '?key=0&url=' + encodeURIComponent(target);

  return _get(url, SITE + '/').then(function (body) {
    var streams = _extractPlayable(body, PLAYER);

    if (streams.length) {
      return _makeStreams(streams, PLAYER);
    }

    // Some responses return the actual URL as JSON.
    var json;

    try {
      json = JSON.parse(body || 'null');
    } catch (e) {
      json = null;
    }

    if (json) {
      var direct = json.url || json.src || json.file
        || (json.data && (
          json.data.url || json.data.src || json.data.file
        ));

      if (direct) {
        var resolved = _absolute(direct, PLAYER);
        return _makeStreams([resolved], PLAYER);
      }
    }

    // Some player pages embed the player in an iframe.
    var iframe = (
      body.match(/<iframe[^>]+src=["']([^"']+)["']/i) || []
    )[1];

    if (iframe) {
      var iframeUrl = _absolute(
        iframe.replace(/&amp;/g, '&'),
        PLAYER
      );

      return _get(iframeUrl, PLAYER).then(function (inner) {
        var links = _extractPlayable(inner, iframeUrl);

        if (!links.length) {
          throw new Error(
            'GirigiriLove: no playable stream found'
          );
        }

        return _makeStreams(links, iframeUrl);
      });
    }

    throw new Error(
      'GirigiriLove: player did not expose a playable URL'
    );
  });
}
