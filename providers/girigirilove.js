/**
 * Zangetsu Provider: GiriGiriLove
 * Converted from Kazumi Rule (giriGiriLove.json)
 */

const BASE_URL = "https://m3u8.girigirilove.com/api.php/Vod";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "https://ani.girigirilove.com"
};

/**
 * 搜索动漫
 * @param {string} query 关键词
 * @returns {Promise<Array>}
 */
async function search(query) {
  try {
    const url = `${BASE_URL}/get_list?vod_name=${encodeURIComponent(query)}&offset=0&limit=24`;
    const resp = await fetch(url, { headers: HEADERS });
    const data = await resp.json();
    const rows = (data && data.info && data.info.rows) || [];

    return rows.map(item => ({
      id: String(item.vod_id),
      title: item.vod_name || "",
      poster: item.vod_pic || "",
      remarks: item.vod_remarks || "",
      type: "anime"
    }));
  } catch (e) {
    console.error("[GiriGiriLove] Search error:", e);
    return [];
  }
}

/**
 * 获取动漫详情与各线路剧集
 * @param {string} id vod_id
 * @returns {Promise<Object>}
 */
async function getDetail(id) {
  try {
    const url = `${BASE_URL}/get_detail?vod_id=${encodeURIComponent(id)}`;
    const resp = await fetch(url, { headers: HEADERS });
    const data = await resp.json();
    const info = (data && data.info) || {};

    const playFroms = (info.vod_play_from || "").split("$$$");
    const playUrls = (info.vod_play_url || "").split("$$$");

    const sources = [];

    for (let i = 0; i < playFroms.length; i++) {
      const routeName = playFroms[i] || `线路 ${i + 1}`;
      const epStrings = (playUrls[i] || "").split("#").filter(Boolean);

      const episodes = epStrings.map((epStr, index) => {
        const parts = epStr.split("$");
        return {
          id: `${id}_${i}_${index}`,
          title: parts[0] || `第 ${index + 1} 集`,
          url: parts[1] || "", // 直接返回 m3u8 播放直链
          number: index + 1
        };
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
      title: info.vod_name || "",
      poster: info.vod_pic || "",
      description: info.vod_content || info.vod_blurb || "",
      sources: sources
    };
  } catch (e) {
    console.error("[GiriGiriLove] Detail error:", e);
    return null;
  }
}

/**
 * 提取可播放视频流 (HLS / m3u8)
 * @param {string} episodeUrl 剧集直链
 * @returns {Promise<Array>}
 */
async function getStreams(episodeUrl) {
  if (!episodeUrl) return [];
  return [
    {
      title: "GiriGiri HLS",
      url: episodeUrl,
      type: "hls",
      quality: "Auto",
      headers: HEADERS
    }
  ];
}
