const baseUrl = "https://ani.girigirilove.com"; // 更新为电脑实际访问跳转后的最新域名

const Provider = {
    id: "girigirilove",
    name: "GiriGiriLove",
    baseUrl: baseUrl,
    lang: "zh",
    type: "anime",

    // 1. 首页/推荐列表：通过苹果CMS接口获取
    async getPopular(page = 1) {
        try {
            const url = `${baseUrl}/api.php/provide/vod?ac=detail&pg=${page}`;
            const res = await fetch(url);
            const data = await res.json();

            if (!data || !data.list) return [];

            return data.list.map(item => ({
                title: item.vod_name,
                url: `${baseUrl}/index.php/vod/detail/id/${item.vod_id}.html`,
                cover: item.vod_pic,
                description: item.vod_remarks || ''
            }));
        } catch (e) {
            return [];
        }
    },

    // 2. 搜索功能
    async search(query, page = 1) {
        try {
            const url = `${baseUrl}/api.php/provide/vod?ac=detail&wd=${encodeURIComponent(query)}&pg=${page}`;
            const res = await fetch(url);
            const data = await res.json();

            if (!data || !data.list) return [];

            return data.list.map(item => ({
                title: item.vod_name,
                url: `${baseUrl}/index.php/vod/detail/id/${item.vod_id}.html`,
                cover: item.vod_pic,
                description: item.vod_remarks || ''
            }));
        } catch (e) {
            return [];
        }
    },

    // 3. 获取详情与剧集列表
    async getDetail(url) {
        const res = await fetch(url);
        const html = await res.text();
        const $ = cheerio.load(html);

        const title = $('h1, h3.slide-info-title, .detail-title').text().trim();
        const description = $('.vod_content, #height_limit, .detail-content').text().trim();
        const cover = $('.detail-pic img, .lazyload').attr('data-original') || $('.detail-pic img').attr('src');

        const episodes = [];
        $('.play_list_box a, .anthology-list-play a, .num-list a').each((_, el) => {
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
        const res = await fetch(url);
        const html = await res.text();
        
        let videoUrl = "";
        const match = html.match(/var player_aaaa=({.*?})<\/script>/);
        if (match && match[1]) {
            try {
                const playerData = JSON.parse(match[1]);
                videoUrl = decodeURIComponent(playerData.url);
            } catch (e) {}
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
