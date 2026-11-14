
/*
 * GirigiriLove — Zangetsu Anime Provider
 * Compatible with Zangetsu v2.3.5
 * Version: 1.0.4
 */

var SOURCE_ID = (typeof __SOURCE_ID !== 'undefined' && __SOURCE_ID)
  ? String(__SOURCE_ID)
  : 'girigirilove';

var SITE = 'https://ani.girigirilove.com';
var API = 'https://m3u8.girigirilove.com/api.php/Vod/';

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

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
    version: '1.0.4'
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

  if (/^https?:\/\//i.test(image)) {
    return image;
  }

  if (image.charAt(0) === '/') {
    return SITE + image;
  }

  return 'https://jpg.girigirilove.com/' + image;
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

  var routes = [];

  for (var i = 0; i < lists.length; i++) {
    var routeName = _str(names[i] || '')
      .trim()
      .toLowerCase();

    var entries = _str(lists[i]).split('#');

    if (!entries.length) continue;

    routes.push({
      name: routeName,
      entries: entries,
      index: i
    });
  }

  if (!routes.length) {
    return [];
  }

  // Prefer simplified Chinese subtitles.
  var selectedRoute = null;

  for (var r = 0; r < routes.length; r++) {
    if (
      routes[r].name === 'chs' ||
      routes[r].name.indexOf('chs') >= 0
    ) {
      selectedRoute = routes[r];
      break;
    }
  }

  // Fallback to the first available route.
  if (!selectedRoute) {
    selectedRoute = routes[0];
  }

  var result = [];
  var entries = selectedRoute.entries;

  for (var j = 0; j < entries.length; j++) {
    var raw = String(entries[j] || '').trim();

    if (!raw) continue;

    var separator = raw.indexOf('$');

    var episodeName = separator >= 0
      ? raw.substring(0, separator).trim()
      : ('第' + (j + 1) + '集');

    var episodeUrl = separator >= 0
      ? raw.substring(separator + 1).trim()
      : raw;

    if (!episodeUrl) continue;

    // Keep the original m3u8 URL.
    result.push({
      id: String(selectedRoute.index) + ':' + String(j),

      number: j + 1,

      title: _clean(episodeName)
        || ('Episode ' + (j + 1)),

      url: episodeUrl
    });
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
// Video source conversion
// --------------------------------------------------

function _makeStreams(url) {
  return [{
    url: url,

    quality: 'auto',

    container: /\.m3u8(\?|$)/i.test(url)
      ? 'hls'
      : 'mp4',

    headers: _headers(SITE + '/'),

    kind: 'sub'
  }];
}

// --------------------------------------------------
// Resolve video
// --------------------------------------------------

function getVideoSources(episodeUrl) {
  var target = String(episodeUrl || '').trim();

  if (!target) {
    return Promise.reject(
      new Error('GirigiriLove: empty episode URL')
    );
  }

  // Support old 1.0.3 episode URLs.
  if (/^girigirilove:\/\//i.test(target)) {
    target = target.replace(/^girigirilove:\/\//i, '');

    var slash = target.indexOf('/');

    if (slash >= 0) {
      target = target.substring(slash + 1);
    }

    try {
      target = decodeURIComponent(target);
    } catch (e) {
      // Keep original value if decoding fails.
    }
  }

  target = _absolute(target, SITE);

  if (!/^https?:\/\//i.test(target)) {
    return Promise.reject(
      new Error('GirigiriLove: invalid episode URL')
    );
  }

  // The API already provides a direct m3u8 URL.
  // Do not wrap it with girigirilove:// or scrape atom.php.
  return Promise.resolve(
    _makeStreams(target)
  );
}
