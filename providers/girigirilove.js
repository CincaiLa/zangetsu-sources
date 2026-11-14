// GiriGiriLove — Zangetsu JS provider
// Converted from Predidit/KazumiRules giriGiriLove.json (v2.6, API level 9)
//
// Kazumi rule -> this file
//   searchApiConfig  -> search()
//   chapterApiConfig -> getDetail() / getEpisodes() / getVideoSources()
//   baseURL          -> BASE (used for Referer)

var VERSION = "2.6.1";
var BASE = "https://ani.girigirilove.com";
var API = "https://m3u8.girigirilove.com/api.php/Vod";
var UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0 Mobile Safari/537.36";

var HEADERS = { "User-Agent": UA, Referer: BASE + "/" };

// ---------------------------------------------------------------- helpers

function log(msg) {
  try { console.log("[girigirilove] " + msg); } catch (e) {}
}

async function rawGet(url) {
  // Try whichever HTTP primitive the Zangetsu JS runtime exposes.
  if (typeof fetch === "function") return await fetch(url, { headers: HEADERS });
  if (typeof http !== "undefined" && http.get) return await http.get(url, { headers: HEADERS });
  if (typeof httpGet === "function") return await httpGet(url, HEADERS);
  if (typeof request === "function") return await request(url, { headers: HEADERS });
  throw new Error("no HTTP function available in this runtime");
}

async function getJson(url) {
  var res;
  try {
    res = await rawGet(url);
  } catch (e) {
    log("request failed: " + url + " -> " + e);
    throw e;
  }
  var body = res;
  if (res && typeof res.json === "function") {
    try { return await res.json(); } catch (e) { log("bad json from " + url); throw e; }
  }
  if (res && typeof res.text === "function") body = await res.text();
  else if (res && typeof res.body === "string") body = res.body;
  else if (res && typeof res.data !== "undefined") body = res.data;
  if (typeof body === "string") {
    try { return JSON.parse(body); } catch (e) { log("non-JSON response: " + body.slice(0, 120)); throw e; }
  }
  return body; // runtime already parsed it
}

function rowsOf(j) {
  if (!j) return [];
  if (j.info && Array.isArray(j.info.rows)) return j.info.rows;
  if (j.info && Array.isArray(j.info.list)) return j.info.list;
  if (Array.isArray(j.rows)) return j.rows;
  if (Array.isArray(j.list)) return j.list;
  if (j.data && Array.isArray(j.data.rows)) return j.data.rows;
  if (Array.isArray(j.data)) return j.data;
  return [];
}

// Kazumi: format "delimited", roadSeparator "$$$", episodeSeparator "#", fieldSeparator "$"
function parsePlay(from, urls) {
  var names = String(from || "").split("$$$");
  var roads = String(urls || "").split("$$$");
  return roads
    .map(function (road, i) {
      var eps = road
        .split("#")
        .filter(Boolean)
        .map(function (raw, n) {
          var k = raw.indexOf("$");
          return {
            name: k < 0 ? "第" + (n + 1) + "集" : raw.slice(0, k) || "第" + (n + 1) + "集",
            url: k < 0 ? raw : raw.slice(k + 1),
          };
        });
      return { name: names[i] || "线路" + (i + 1), episodes: eps };
    })
    .filter(function (r) {
      return r.episodes.length;
    });
}

// episode ref = "<vod_id>|<episode index>"
function makeRef(id, idx) {
  return id + "|" + idx;
}
function parseRef(ref) {
  var p = String(ref).split("|");
  return { id: p[0], idx: parseInt(p[1] || "0", 10) || 0 };
}

async function fetchDetail(id) {
  var j = await getJson(API + "/get_detail?vod_id=" + encodeURIComponent(id));
  return (j && j.info) || {};
}

function isDirect(u) {
  return /\.(m3u8|mp4|mkv|flv)(\?|#|$)/i.test(u);
}

// ------------------------------------------------------------- contract

function getInfo() {
  return {
    id: "girigirilove",
    name: "GiriGiriLove",
    version: VERSION,
    type: "anime",
    lang: "zh",
    nsfw: false,
  };
}

function getSettings() {
  return [];
}

async function getHome() {
  // Kazumi rule has no home/browse endpoint; reuse the list API with an empty keyword.
  var j = await getJson(API + "/get_list?offset=0&limit=24");
  var rows = (j && j.info && j.info.rows) || [];
  return [{ title: "最新", items: rows.map(toItem) }];
}

function toItem(r) {
  var id = String(r.vod_id);
  return {
    id: id,
    url: id,
    title: r.vod_name,
    name: r.vod_name,
    poster: r.vod_pic || r.vod_pic_thumb || "",
    image: r.vod_pic || r.vod_pic_thumb || "",
  };
}

// searchApiConfig: GET get_list?vod_name=@keyword&offset=0&limit=24
// listPath $.info.rows[*], namePath $.vod_name, sourcePath $.vod_id
async function search(query, page) {
  var p = Math.max(1, parseInt(page || 1, 10));
  var limit = 24;
  var q = String(query || "").trim();
  var tries = [q];
  // fall back to a shorter keyword (drop season/part suffixes, then first 4 chars)
  var base = q.replace(/\s*(第[一二三四五六七八九十\d]+[季期部]|season\s*\d+|part\s*\d+).*$/i, "").trim();
  if (base && base !== q) tries.push(base);
  if (base.length > 4) tries.push(base.slice(0, 4));

  for (var i = 0; i < tries.length; i++) {
    var j = await getJson(
      API +
        "/get_list?vod_name=" + encodeURIComponent(tries[i]) +
        "&offset=" + (p - 1) * limit +
        "&limit=" + limit
    );
    var rows = rowsOf(j);
    log("search '" + tries[i] + "' -> " + rows.length + " rows");
    if (rows.length) return rows.map(toItem);
  }
  return [];
}

// chapterApiConfig: GET get_detail?vod_id=@source
async function getDetail(url) {
  var id = String(url).split("|")[0];
  var info = await fetchDetail(id);
  var roads = parsePlay(info.vod_play_from, info.vod_play_url);
  var longest = roads.reduce(function (a, r) {
    return r.episodes.length > a.length ? r.episodes : a;
  }, []);

  var episodes = longest.map(function (e, i) {
    return { number: i + 1, title: e.name, name: e.name, url: makeRef(id, i) };
  });

  return {
    id: id,
    url: id,
    title: info.vod_name || "",
    name: info.vod_name || "",
    poster: info.vod_pic || "",
    image: info.vod_pic || "",
    description: String(info.vod_content || info.vod_blurb || "").replace(/<[^>]+>/g, ""),
    year: info.vod_year ? String(info.vod_year) : undefined, // must be a String, not int
    status: info.vod_remarks || undefined,
    genres: info.vod_class ? String(info.vod_class).split(/[,，]/) : [],
    episodes: episodes,
  };
}

async function getEpisodes(url) {
  var d = await getDetail(url);
  return d.episodes;
}

// One source per road (线路), like Kazumi's multi-source (muliSources: true)
async function getVideoSources(url) {
  var ref = parseRef(url);
  var info = await fetchDetail(ref.id);
  var roads = parsePlay(info.vod_play_from, info.vod_play_url);
  var out = [];

  for (var i = 0; i < roads.length; i++) {
    var ep = roads[i].episodes[ref.idx];
    if (!ep || !ep.url) continue;
    var u = ep.url.replace(/^http:\/\//i, "https://");
    out.push({
      url: u,
      quality: roads[i].name,
      label: roads[i].name,
      server: roads[i].name,
      isM3U8: /\.m3u8(\?|#|$)/i.test(u),
      type: /\.m3u8(\?|#|$)/i.test(u) ? "hls" : "video",
      headers: HEADERS,
      // Non-direct URLs are web pages that Kazumi would sniff in a WebView.
      // Zangetsu's JS bridge can't do that, so they are flagged here.
      needsWebview: !isDirect(u),
    });
  }
  return out;
}

async function getStreams(url) {
  return getVideoSources(url);
}
