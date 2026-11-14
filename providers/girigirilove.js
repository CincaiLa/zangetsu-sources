const baseUrl = "https://anime.girigirilove.com"; // 确认该域名在你的网络环境下可直接打开

const Provider = {
    id: "girigirilove",
    name: "GiriGiriLove",
    baseUrl: baseUrl,
    lang: "zh",
    type: "anime",

    // 1. 首页/热门列表（点进源主页时默认加载，缺失会导致报错）
    async getPopular(page = 1) {
        const url = `${baseUrl}/show/2--------${page}---.html`; // 根据实际分类页 URL 调整
        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
        });
        const html = await res.text();
        const $ = cheerio.load(html);
        const results = [];

        // 苹果CMS常见结构示例，请根据实际网页元素微调
        $('.public-list-box').each((_, el) => {
            const title = $(el).find('.time-title').text().trim();
            const href = $(el).find('a').attr('href');
            const cover = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
            if (title && href) {
                results.push({
                    title,
                    url: href.startsWith('http') ? href : `${baseUrl}${href}`,
                    cover: cover?.startsWith('http') ? cover : `${baseUrl}${cover}`
                });
            }
        });
        return results;
    },

    // 2. 搜索功能（点击右上角放大镜时调用）
    async search(query, page = 1) {
        const url = `${baseUrl}/search/-------------/?wd=${encodeURIComponent(query)}&page=${page}`;
        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
        });
        const html = await res.text();
        const $ = cheerio.load(html);
        const results = [];

        $('.search-box, .public-list-box').each((_, el) => {
            const title = $(el).find('.thumb-txt, .time-title').text().trim();
            const href = $(el).find('a').attr('href');
            const cover = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
            if (title && href) {
                results.push({
                    title,
                    url: href.startsWith('http') ? href : `${baseUrl}${href}`,
                    cover: cover?.startsWith('http') ? cover : `${baseUrl}${cover}`
                });
            }
        });
        return results;
    },

    // 3. 详情与剧集列表
    async getDetail(url) {
        const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
        const res = await fetch(fullUrl);
        const html = await res.text();
        const $ = cheerio.load(html);

        const title = $('h3.slide-info-title').text().trim();
        const description = $('#height_limit').text().trim();
        const cover = $('.detail-pic img').attr('data-src') || $('.detail-pic img').attr('src');

        const episodes = [];
        $('.anthology-list-play a').each((_, el) => {
            const epUrl = $(el).attr('href');
            episodes.push({
                name: $(el).text().trim(),
                url: epUrl.startsWith('http') ? epUrl : `${baseUrl}${epUrl}`
            });
        });

        return { title, description, cover, episodes };
    },

    // 4. 解析播放直链
    async getVideoSource(url) {
        const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
        const res = await fetch(fullUrl);
        const html = await res.text();

        // 从网页源码的 player_aaaa 变量中提取真实播放地址
        const match = html.match(/var player_aaaa=({.*?})<\/script>/);
        let videoUrl = "";
        if (match && match[1]) {
            const playerData = JSON.parse(match[1]);
            videoUrl = decodeURIComponent(playerData.url);
        }

        return {
            url: videoUrl,
            headers: {
                "Referer": baseUrl,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        };
    }
};
