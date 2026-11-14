
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
    version: '1.0.2'
  };
}

// ── HTTP ────────────────────────────────────────────────────────────────────

function _get(url, ref) {
  return fetch(url, {
    headers: {
      'User-Agent': UA,
      'Referer': ref || SITE + '/'
    }
  }).then(function (r) {
    return r.body || '';
  });
}

function _json(url) {
  return _get(url, SITE + '/').then(function (body) {
    return JSON.parse(body || 'null');
  });
}

function _text(s) {
  return htmlText(String(s || '').replace(/<[^>]*>/g, ''))
    .replace(/^\s+|\s+$/g, '');
}

function _str(v) {
  return v == null ? '' : String(v);
}

function _rows(json) {
  var info = json && json.info;
  if (!info) return [];
  return Array.isArray(info.rows) ? info.rows : [];
}

function _item(row) {
  var id = _str(row.vod_id);
  var title = _text(row.vod_name || row.vod_en || id);
  var cover = _str(row.vod_pic || '');

  if (cover.indexOf('//') === 0) {
    cover = 'https:' + cover;
  }

  return {
    id: id,
    title: title,
    englishTitle: _text(row.vod_en || row.vod_name || id),
    cover: cover || null,
    url: id,
    type: 'anime',
    sourceId: SOURCE_ID,
    description: _text(row.vod_blurb || row.vod_content || ''),
    year: _str(row.vod_year || '') || null,
    status: _text(row.vod_remarks || '')
  };
}

// ── Home ────────────────────────────────────────────────────────────────────

function getHome(opts) {
  var page = Math.max(
    1,
    parseInt(opts && opts.page ? opts.page : 1, 10) || 1
  );

  var offset = (page - 1) * 24;

  var url = API + 'get_list?offset=' + offset + '&limit=24';

  return _json(url).then(function (json) {
    var items = _rows(json).map(_item);

    if (!items.length) return [];

    return [{
      title: '最新更新',
      items: items
    }];
  }).catch(function (e) {
    console.log('GirigiriLove Home Error: ' + e);
    return [];
  });
}

// ── Search ──────────────────────────────────────────────────────────────────

function search(query, page, opts) {
  var q = String(query || '').trim();

  if (!q) return Promise.resolve([]);

  var p = Math.max(1, parseInt(page || 1, 10) || 1);
  var offset = (p - 1) * 24;

  var url = API + 'get_list?vod_name='
    + encodeURIComponent(q)
    + '&offset=' + offset
    + '&limit=24';

  return _json(url).then(function (json) {
    return _rows(json).map(_item);
  }).catch(function (e) {
    console.log('GirigiriLove Search Error: ' + e);
    return [];
  });
}

// ── Detail ──────────────────────────────────────────────────────────────────

function _first(v) {
  return Array.isArray(v) ? (v[0] || {}) : (v || {});
}

function _splitPlaySources(info) {
  var names = _str(info.vod_play_from || '').split('$$$');
  var lists = _str(info.vod_play_url || '').split('$$$');
  var result = [];

  for (var i = 0; i < lists.length; i++) {
    var route = _text(names[i] || ('线路 ' + (i + 1)));
    var episodes = lists[i].split('#');

    for (var j = 0; j < episodes.length; j++) {
      var entry = episodes[j];
      if (!entry) continue;

      var pos = entry.indexOf('$');

      var title = pos >= 0
        ? entry.substring(0, pos)
        : '第' + (j + 1) + '集';

      var episodeUrl = pos >= 0
        ? entry.substring(pos + 1)
        : entry;

      if (!episodeUrl) continue;

      result.push({
        id: i + ':' + j,
        number: j + 1,
        title: _text(title),
        url: 'girigirilove://'
          + encodeURIComponent(route)
          + '/'
          + encodeURIComponent(episodeUrl)
      });
    }
  }

  return result;
}

function getDetail(url, opts) {
  var id = String(url || '').trim();

  if (!id) return Promise.resolve(null);

  return _json(
    API + 'get_detail?vod_id=' + encodeURIComponent(id)
  ).then(function (json) {
    var info = _first(json && json.info);

    var cover = _str(info.vod_pic || '');

    if (cover.indexOf('//') === 0) {
      cover = 'https:' + cover;
    }

    return {
      id: _str(info.vod_id || id),
      title: _text(info.vod_name || id),
      englishTitle: _text(info.vod_en || info.vod_name || id),
      url: _str(info.vod_id || id),
      cover: cover || null,
      description: _text(
        info.vod_content || info.vod_blurb || ''
      ),
      status: _text(info.vod_remarks || ''),
      year: _str(info.vod_year || '') || null,
      genres: _str(info.vod_class || '')
        .split(/[，,、]/).filter(Boolean),
      type: 'anime',
      sourceId: SOURCE_ID,
      episodes: _splitPlaySources(info)
    };
  });
}

function getEpisodes(url, opts) {
  return getDetail(url, opts).then(function (detail) {
    return detail && detail.episodes
      ? detail.episodes : [];
  });
}

// ── Player ──────────────────────────────────────────────────────────────────

function _decodeEpisodeUrl(value) {
  var s = String(value || '').replace(/^girigirilove:\/\//, '');

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
    var origin = (String(base).match(/^https?:\/\/[^/]+/) || [''])[0];
    return origin + u;
  }

  return String(base || '') + '/' + u;
}

function _extractPlayable(body, base) {
  var text = String(body || '');
  var result = [];
  var seen = {};

  var patterns = [
    /https?:\\?\/\\?\/[^"'\\\s<>]+?\.m3u8(?:\?[^"'\\\s<>]*)?/ig,
    /https?:\\?\/\\?\/[^"'\\\s<>]+?\.mp4(?:\?[^"'\\\s<>]*)?/ig,
    /(?:file|url|src)\s*[:=]\s*["']([^"']+)["']/ig
  ];

  for (var i = 0; i < patterns.length; i++) {
    var match;

    while ((match = patterns[i].exec(text)) !== null) {
      var candidate = (match[1] || match[0])
        .replace(/\\\//g, '/')
        .replace(/&amp;/g, '&');

      candidate = _absolute(candidate, base);

      if (/^https?:\/\//i.test(candidate) && !seen[candidate]) {
        seen[candidate] = true;
        result.push(candidate);
      }
    }
  }

  return result;
}

function _makeStreams(urls, ref) {
  return urls.map(function (url, index) {
    return {
      url: url,
      quality: index === 0 ? 'auto' : 'source ' + (index + 1),
      container: /\.m3u8(\?|$)/i.test(url) ? 'hls' : 'mp4',
      headers: {
        'User-Agent': UA,
        'Referer': ref || SITE + '/'
      },
      kind: 'sub'
    };
  });
}

function getVideoSources(episodeUrl) {
  var target = _decodeEpisodeUrl(episodeUrl);

  if (!target) {
    return Promise.reject(new Error('Empty episode URL'));
  }

  var url = PLAYER + '?key=0&url=' + encodeURIComponent(target);

  return _get(url, SITE + '/').then(function (body) {
    var streams = _extractPlayable(body, PLAYER);

    if (streams.length) {
      return _makeStreams(streams, PLAYER);
    }

    var json = null;

    try {
      json = JSON.parse(body || 'null');
    } catch (e) {}

    if (json) {
      var direct = json.url || json.src || json.file
        || (json.data && (
          json.data.url || json.data.src || json.data.file
        ));

      if (direct) {
        return _makeStreams(
          [_absolute(direct, PLAYER)],
          PLAYER
        );
      }
    }

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
          throw new Error('No playable stream found');
        }

        return _makeStreams(links, iframeUrl);
      });
    }

    throw new Error('GirigiriLove player URL not found');
  });
}
