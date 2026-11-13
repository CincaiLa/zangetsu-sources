/**
 * Zangetsu Provider: GiriGiriLove
 * Base: https://m3u8.girigirilove.com/api.php/Vod
 */

const BASE_URL = "https://m3u8.girigirilove.com/api.php/Vod";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "https://ani.girigirilove.com"
};

/**
 * 通用列表获取函数（支持热门、最新、搜索）
 */
async function fetchList(keyword = "", page = 1) {
  try {
    const limit = 24;
    const offset = Math.max(0, (page - 1) * limit);
    let url = `${BASE_URL}/get_list?offset=${offset}&limit=${limit}`;
    
    if (keyword && keyword.trim()) {
      url += `&vod_name=${encodeURIComponent(keyword.trim())}`;
    }

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

    // 双重兼容：同时支持纯数组格式和对象分页格式
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
 * 获取首页 / 热门番剧（解决进入页面显示“没有作品”的关键）
 */
async function getPopular(page = 1) {
  return await fetchList("", page);
}

/**
 * 获取最新更新
 */
async function getLatestUpdates(page = 1) {
  return await fetchList("", page);
}

/**
 * 搜索番剧
 */
async function search(query, page = 1) {
  return await fetchList(query, page);
}

/**
 * 获取番剧详情与集数列表
 */
async function getDetail(id) {
  try {
    const url = `${BASE_URL}/get_detail?vod_id=${encodeURIComponent(id)}`;
    const resp = await fetch(url, { headers: HEADERS });
    const data = await resp.json();
    const info = (data && data.info) || {};

    const playFroms = (info.vod_play_from || "").split("$$$");
    const playUrls = (info.vod_play_url || "").split("$$$");

    const flatChapters = [];
    const sources = [];

    for (let i = 0; i < playFroms.length; i++) {
      const routeName = playFroms[i] || `线路 ${i + 1}`;
      const epStrings = (playUrls[i] || "").split("#").filter(Boolean);

      const episodes = epStrings.map((epStr, index) => {
        const parts = epStr.split("$");
        const epTitle = parts[0] || `第 ${index + 1} 集`;
        const epUrl = parts[1] || "";
        
        const epObj = {
          id: `${id}_${i}_${index}`,
          name: playFroms.length > 1 ? `[${routeName}] ${epTitle}` : epTitle,
          title: epTitle,
          url: epUrl,
          number: index + 1
        };

        flatChapters.push(epObj);
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
      id: String(info.vod_id || id),
      name: info.vod_name || "",
      title: info.vod_name || "",
      imageUrl: info.vod_pic || "",
      poster: info.vod_pic || "",
      cover: info.vod_pic || "",
      description: info.vod_content || info.vod_blurb || "",
      status: 1,
      genre: (info.vod_class || "").split(",").filter(Boolean),
      chapters: flatChapters, // 兼容单列表模式
      episodes: flatChapters,
      sources: sources        // 兼容多线路模式
    };
  } catch (e) {
    console.error("[GiriGiriLove] getDetail error:", e);
    return null;
  }
}

/**
 * 视频播放地址提取（同时提供 getStreams 与 getVideoList 接口）
 */
async function getVideoList(url) {
  if (!url) return [];
  return [
    {
      url: url,
      originalUrl: url,
      quality: "默认",
      headers: HEADERS
    }
  ];
}

async function getStreams(url) {
  if (!url) return [];
  return [
    {
      name: "GiriGiri HLS",
      title: "GiriGiri HLS",
      url: url,
      type: "hls",
      quality: "默认",
      headers: HEADERS
    }
  ];
}

// 全局暴露与模块兼容导出
if (typeof globalThis !== "undefined") {
  globalThis.getPopular = getPopular;
  globalThis.getLatestUpdates = getLatestUpdates;
  globalThis.search = search;
  globalThis.getDetail = getDetail;
  globalThis.getVideoList = getVideoList;
  globalThis.getStreams = getStreams;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getPopular,
    getLatestUpdates,
    search,
    getDetail,
    getVideoList,
    getStreams
  };
}
