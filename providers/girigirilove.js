
/*
 * GirigiriLove — Zangetsu Anime Provider
 * Compatible with Zangetsu v2.3.5
 * Version: 1.0.3
 */

var SOURCE_ID = (typeof __SOURCE_ID !== 'undefined' && __SOURCE_ID)
  ? String(__SOURCE_ID)
  : 'girigirilove';

var SITE = 'https://ani.girigirilove.com';
var API = 'https://m3u8.girigirilove.com/api.php/Vod/';
var PLAYER = 'https://pl.girigirilove.com/addons/aplyer/atom.php';

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

var PAGE_SIZE = 24;

// --------------------------------------------------
// Provider information
// --------------------------------------------------

function getInfo() {
  return {
    name: 'GirigiriLove',
    lang: 'zh',
    baseUrl: SITE,
    logo: SITE + '/favicon.ico',
    type: 'anime',
    version: '1.0.3'
  };
}

// --------------------------------------------------
// HTTP helpers
// --------------------------------------------------

function _headers(ref) {
  return {
    'User-Agent': UA,
    'Referer': ref || SITE + '/'
  };
}

function _get(url, ref) {
  return fetch(url, {
    headers: _headers(ref)
  }).then(function (r) {
    return r.body || '';
  });
}

function _json(url, ref) {
  return _get(url, ref).then(function (body) {
    var json;

    try {
      json = JSON.parse(body || 'null');
    } catch (e) {
      throw new Error('GirigiriLove: invalid JSON response');
    }

    if (!json) {
      throw new Error('GirigiriLove: empty API response');
    }

    if (json.code !== undefined && Number(json.code) !== 1) {
      throw new Error(
        'GirigiriLove API error: ' + String(json.msg || json.code)
      );
    }

    return json;
  });
}

function _str(value) {
  return value == null ? '' : String(value);
}

function _clean(value) {
  return htmlText(String(value || '').replace(/<[^>]*>/g, ''))
    .replace(/^\s+|\s+$/g, '');
}

function _first(value) {
  if (Array.isArray(value)) {
    return value[0] || {};
  }

  return value || {};
}

// --------------------------------------------------
// API response parsing
// --------------------------------------------------

function _rows(json) {
  var info = json && json.info;

  if (!info) return [];

  if (Array.isArray(info.rows)) {
    return info.rows;
  }

  if (Array.isArray(info)) {
    return info;
  }

  if (info.vod_id != null) {
    return [info];
  }

  return [];
}

function _cover(row) {
  var image = _str(
    row.vod_pic || row.vod_pic_thumb || ''
  );

  if (!image) return null;

  if (image.indexOf('//') === 0) {
    return 'https:' + image;
  }

  return image;
}

// --------------------------------------------------
// Convert API item to Zangetsu MediaItem
// --------------------------------------------------

function _item(row) {
  var id = _str(row.vod_id);

  var title = _clean(
    row.vod_name || row.vod_en || id
  );

  if (!id || !title) {
    return null;
  }

  return {
    id: id,
    title: title,

    englishTitle: _clean(
      row.vod_en || row.vod_name || id
    ),

    cover: _cover(row),

    url: id,

    type: 'anime',

    sourceId: SOURCE_ID
  };
}

function _items(rows) {
  var result = [];

  if (!Array.isArray(rows)) {
    return result;
  }

  for (var i = 0; i < rows.length; i++) {
    var item = _item(rows[i]);

    if (item) {
      result.push(item);
    }
  }

  return result;
}

// --------------------------------------------------
// Listing API
// --------------------------------------------------

function _getList(query, page) {
  var p = Math.max(
    1,
    parseInt(page || 1, 10) || 1
  );

  var offset = (p - 1) * PAGE_SIZE;

  var url = API + 'get_list?offset=' + offset
    + '&limit=' + PAGE_SIZE;

  if (query) {
    url += '&vod_name=' + encodeURIComponent(query);
  }

  return _json(url, SITE + '/').then(function (json) {
    return _items(_rows(json));
  });
}

// --------------------------------------------------
// Home
// --------------------------------------------------

function getHome(opts) {
  var page = opts && opts.page
    ? opts.page
    : 1;

  return _getList('', page).then(function (items) {
    if (!items.length) {
      return [];
    }

    return [{
      title: '最新更新',
      items: items
    }];
  }).catch(function (error) {
    console.log(
      '[GirigiriLove] getHome failed: ' + String(error)
    );

    throw error;
  });
}

// --------------------------------------------------
// Popular fallback
// --------------------------------------------------

function popular(opts) {
  var page = opts && opts.page
    ? opts.page
    : 1;

  return _getList('', page).catch(function (error) {
    console.log(
      '[GirigiriLove] popular failed: ' + String(error)
    );

    throw error;
  });
}

// --------------------------------------------------
// Search
// --------------------------------------------------

function search(query, page, opts) {
  var q = String(query || '').trim();

  if (!q) {
    return Promise.resolve([]);
  }

  return _getList(q, page).catch(function (error) {
    console.log(
      '[GirigiriLove] search failed: ' + String(error)
    );

    throw error;
  });
}

// --------------------------------------------------
// Detail and episode parsing
// --------------------------------------------------

function _splitPlaySources(info) {
  var names = _str(
    info.vod_play_from || ''
  ).split('$$$');

  var lists = _str(
    info.vod_play_url || ''
  ).split('$$$');

  var result = [];

  for (var i = 0; i < lists.length; i++) {
    var routeName = _clean(
      names[i] || ('线路 ' + (i + 1))
    );

    var entries = lists[i].split('#');

    for (var j = 0; j < entries.length; j++) {
      var raw = entries[j];

      if (!raw) continue;

      var separator = raw.indexOf('$');

      var episodeName = separator >= 0
        ? raw.substring(0, separator)
        : ('第' + (j + 1) + '集');

      var episodeUrl = separator >= 0
        ? raw.substring(separator + 1)
        : raw;

      episodeUrl = String(episodeUrl || '').trim();

      if (!episodeUrl) continue;

      result.push({
        id: String(i) + ':' + String(j),

        number: j + 1,

        title: _clean(episodeName)
          || ('Episode ' + (j + 1)),

        url: 'girigirilove://'
          + encodeURIComponent(routeName)
          + '/'
          + encodeURIComponent(episodeUrl)
      });
    }
  }

  return result;
}

// --------------------------------------------------
// Detail
// --------------------------------------------------

function getDetail(url, opts) {
  var id = String(url || '').trim();

  if (!id) {
    return Promise.reject(
      new Error('GirigiriLove: empty detail id')
    );
  }

  return _json(
    API + 'get_detail?vod_id=' + encodeURIComponent(id),
    SITE + '/'
  ).then(function (json) {
    var info = _first(json.info);

    var row = _rows(json)[0] || info;

    var episodes = _splitPlaySources(info);

    return {
      id: _str(info.vod_id || id),

      title: _clean(
        info.vod_name || row.vod_name || id
      ),

      englishTitle: _clean(
        info.vod_en || info.vod_name || row.vod_name || id
      ),

      url: _str(info.vod_id || id),

      cover: _cover(info) || _cover(row),

      description: _clean(
        info.vod_content || info.vod_blurb || ''
      ),

      year: _str(info.vod_year || '') || null,

      genres: _str(info.vod_class || '')
        .split(/[，,、]/)
        .filter(function (v) {
          return !!v;
        }),

      type: 'anime',

      sourceId: SOURCE_ID,

      episodes: episodes
    };
  }).catch(function (error) {
    console.log(
      '[GirigiriLove] getDetail failed: ' + String(error)
    );

    throw error;
  });
}

// --------------------------------------------------
// Episodes
// --------------------------------------------------

function getEpisodes(url, opts) {
  return getDetail(url, opts).then(function (detail) {
    return detail && Array.isArray(detail.episodes)
      ? detail.episodes
      : [];
  });
}

// --------------------------------------------------
// Player URL helpers
// --------------------------------------------------

function _decodeEpisodeUrl(value) {
  var s = String(value || '')
    .replace(/^girigirilove:\/\//, '');

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
  var value = String(url || '').trim();

  if (!value) return '';

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (value.indexOf('//') === 0) {
    return 'https:' + value;
  }

  if (value.charAt(0) === '/') {
    var origin = (
      String(base).match(/^https?:\/\/[^/]+/i) || ['']
    )[0];

    return origin + value;
  }

  return String(base || '') + '/' + value;
}

// --------------------------------------------------
// Extract playable links
// --------------------------------------------------

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
    var match;

    while ((match = patterns[p].exec(text)) !== null) {
      var candidate = (match[1] || match[0])
        .replace(/\\\//g, '/')
        .replace(/&amp;/g, '&');

      candidate = _absolute(candidate, base);

      if (
        /^https?:\/\//i.test(candidate)
        && !seen[candidate]
      ) {
        seen[candidate] = true;
        found.push(candidate);
      }
    }
  }

  return found;
}

// --------------------------------------------------
// Video source conversion
// --------------------------------------------------

function _makeStreams(urls, ref) {
  return urls.map(function (url, index) {
    return {
      url: url,

      quality: index === 0
        ? 'auto'
        : 'source ' + (index + 1),

      container: /\.m3u8(\?|$)/i.test(url)
        ? 'hls'
        : 'mp4',

      headers: _headers(ref),

      kind: 'sub'
    };
  });
}

// --------------------------------------------------
// Resolve video
// --------------------------------------------------

function getVideoSources(episodeUrl) {
  var target = _decodeEpisodeUrl(episodeUrl);

  if (!target) {
    return Promise.reject(
      new Error('GirigiriLove: empty episode URL')
    );
  }

  var url = PLAYER
    + '?key=0&url='
    + encodeURIComponent(target);

  return _get(url, SITE + '/').then(function (body) {
    var streams = _extractPlayable(body, PLAYER);

    if (streams.length) {
      return _makeStreams(streams, PLAYER);
    }

    // JSON response
    var json = null;

    try {
      json = JSON.parse(body || 'null');
    } catch (e) {
      json = null;
    }

    if (json) {
      var direct = json.url
        || json.src
        || json.file
        || (
          json.data && (
            json.data.url
            || json.data.src
            || json.data.file
          )
        );

      if (direct) {
        return _makeStreams(
          [_absolute(direct, PLAYER)],
          PLAYER
        );
      }
    }

    // iframe response
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
  }).catch(function (error) {
    console.log(
      '[GirigiriLove] getVideoSources failed: ' + String(error)
    );

    throw error;
  });
}
