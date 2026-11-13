/**
 * Zangetsu Provider: GiriGiriLove (Full Compatible Version)
 * Base: https://m3u8.girigirilove.com/api.php/Vod
 */

const BASE_URL = "https://m3u8.girigirilove.com/api.php/Vod";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "https://ani.girigirilove.com/"
};

/**
 * 辅助函数：安全提取 vod_id（无论传入的是字符串、数字还是对象）
 */
function extractVodId(input) {
  if (!input) return "";
  if (typeof input === "object") {
    return String(input.id || input.vod_id || input.url || input.link || "");
  }
  return String(input);
}

/**
 * 辅助函数：安全提取播放直链
 */
function extractStreamUrl(input) {
  if (!input) return "";
  if (typeof input === "object") {
    return String(input.url || input.streamUrl || input.link || input.id || "");
  }
  return String(input);
}

/**
 * 列表请求（支持分页与通配符浏览）
 */
async function fetchList(keyword = "", page = 1) {
  try {
    const limit = 24;
    const offset = Math.max(0, (page - 1) * limit);
    
    // 如果没有关键词，使用通配符 % 查询以拉取全部/最新作品
    const queryWord = keyword && keyword.trim() ? keyword.trim() : "%";
    const url = `${BASE_URL}/get_list?vod_name=${encodeURIComponent(queryWord)}&offset=${offset}&limit=${limit}`;

    const resp = await fetch(url, { headers: HEADERS });
    const data = await resp.json();
    const rows = (data && data.info && data.info.rows) || [];

    const items = rows.map(item => ({
      id: String(item.vod_id),
      name: item.vod_name || "",
      title: item.vod_name || "",
      link: String(item.vod_id),
      url: String(item.vod_id),
      imageUrl: item.vod_pic || "",
      poster: item.vod_pic || "",
      cover: item.vod_pic || "",
      remarks: item.vod_remarks || "",
      type: "anime"
    }));

    items.list = items;
    items.hasNextPage = rows.length >= limit;
    return items;
  } catch (e) {
    console.error("[GiriGiriLove] fetchList error:", e);
    const empty = [];
    empty.list = [];
    empty.hasNextPage = false;
    return empty;
  }
}

/**
 * 1. 首页/热门浏览
 */
async function getPopular(page = 1) {
  return await fetchList("", page);
}

/**
 * 2. 最新更新浏览
 */
async function getLatestUpdates(page = 1) {
  return await fetchList("", page);
}

/**
 * 3. 搜索接口
 */
async function search(query, page = 1) {
  return await fetchList(query, page);
}

/**
 * 4. 详情接口（自动解包 ID）
 */
async function getDetail(input) {
  try {
    const vodId = extractVodId(input);
    if (!vodId) return null;

    const url = `${BASE_URL}/get_detail?vod_id=${encodeURIComponent(vodId)}`;
    const resp = await fetch(url, { headers: HEADERS });
    const data = await resp.json();
    const info = (data && data.info) || {};

    const playFroms = (info.vod_play_from || "").split("$$$");
    const playUrls = (info.vod_play_url || "").split("$$$");

    const flatEpisodes = [];
    const sources = [];

    for (let i = 0; i < playFroms.length; i++) {
      const routeName = playFroms[i] || `线路 ${i + 1}`;
      const epStrings = (playUrls[i] || "").split("#").filter(Boolean);

      const episodes = epStrings.map((epStr, index) => {
        const parts = epStr.split("$");
        const epTitle = parts[0] || `第 ${index + 1} 集`;
        const epUrl = parts.slice(1).join("$") || "";

        const epObj = {
          id: epUrl, // 集数 ID 直接绑定为 m3u8 地址
          number: index + 1,
          episode: index + 1,
          title: epTitle,
          name: playFroms.length > 1 ? `[${routeName}] ${epTitle}` : epTitle,
          url: epUrl,
          link: epUrl,
          streamUrl: epUrl
        };

        flatEpisodes.push(epObj);
        return epObj;
      });

      if (episodes.length > 0) {
        sources.push({
          name: routeName,
          episodes: episodes
        });
      }
    }

    return {
      id: String(info.vod_id || vodId),
      name: info.vod_name || "",
      title: info.vod_name || "",
      imageUrl: info.vod_pic || "",
      poster: info.vod_pic || "",
      cover: info.vod_pic || "",
      description: info.vod_content || info.vod_blurb || "",
      status: 1,
      genre: (info.vod_class || "").split(",").filter(Boolean),
      episodes: flatEpisodes,
      chapters: flatEpisodes,
      sources: sources
    };
  } catch (e) {
    console.error("[GiriGiriLove] getDetail error:", e);
    return null;
  }
}

/**
 * 5. Zangetsu 原生集数接口：getEpisodes
 */
async function getEpisodes(input) {
  const detail = await getDetail(input);
  if (!detail) return [];
  return detail.episodes || detail.chapters || [];
}

/**
 * 6. Zangetsu 原生流提取接口：getStream
 */
async function getStream(input) {
  const streamUrl = extractStreamUrl(input);
  if (!streamUrl) return null;

  // 构造全兼容返回结构（同时兼容纯对象、stream属性对象以及数组格式）
  const streamItem = {
    name: "GiriGiriLove HLS",
    title: "默认",
    url: streamUrl,
    type: "hls",
    quality: "1080p",
    headers: HEADERS
  };

  const result = [streamItem];
  result.stream = streamItem;
  result.url = streamUrl;
  result.type = "hls";
  result.headers = HEADERS;
  result.subtitles = [];

  return result;
}

// 兼容各种命名风格别名
const getStreams = getStream;
const getVideoList = getStream;
const getDetails = getDetail;
const popular = getPopular;
const latest = getLatestUpdates;

// 全局暴露与模块兼容导出
if (typeof globalThis !== "undefined") {
  globalThis.getPopular = getPopular;
  globalThis.getLatestUpdates = getLatestUpdates;
  globalThis.search = search;
  globalThis.getDetail = getDetail;
  globalThis.getDetails = getDetail;
  globalThis.getEpisodes = getEpisodes;
  globalThis.getStream = getStream;
  globalThis.getStreams = getStream;
  globalThis.getVideoList = getVideoList;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getPopular,
    getLatestUpdates,
    search,
    getDetail,
    getDetails,
    getEpisodes,
    getStream,
    getStreams,
    getVideoList
  };
}
