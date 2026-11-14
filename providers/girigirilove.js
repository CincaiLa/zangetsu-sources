const baseUrl = "https://ani.girigirilove.com";

const Provider = {
    id: "girigirilove",
    name: "GiriGiriLove",
    baseUrl: baseUrl,
    lang: "zh",
    type: "anime",

    // 1. 首页推荐列表：通过抓取网页 HTML 获取
    async getPopular(page = 1) {
        try {
            // 访问首页或列表页
            const url = page === 1 ? `${baseUrl}/home` : `${baseUrl}/show/page/${page}.html`;
            const res = await fetch(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
            });
            const html = await res.text();
            const $ = cheerio.load(html);
            const results = [];

            // 适配常见视频站点的列表卡片选择器（可根据实际网页元素调整）
            $('.myui-vodlist__item, .public-list-box, .item, li').each((_, el) => {
                const title = $(el).find('.title, .myui-vodlist__title, .text').text().trim();
                const href = $(el).find('a').attr('href');
                const cover = $(el).find('img').attr('data-original') || $(el).find('img').attr('src') || $(el).find('img').attr('data-src');

                if (title && href && !results.some(r => r.url === href)) {
                    results.push({
                        title: title,
                        url: href.startsWith('http') ? href : `${baseUrl}${href}`,
                        cover: cover ? (cover.startsWith('http') ? cover : `${baseUrl}${cover}`) : ''
                    });
                }
            });

            return results;
        } catch (e) {
            return [];
        }
    },

    // 2. 搜索功能
    async search(query, page = 1) {
        try {
            const url = `${baseUrl}/search/page/${page}?wd=${encodeURIComponent(query)}`;
            const res = await fetch(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            });
            const html = await res.text();
            const $ = cheerio.load(html);
            const results = [];

            $('.myui-vodlist__item, .public-list-box, .search-box').each((_, el) => {
                const title = $(el).find('.title, .myui-vodlist__title').text().trim();
                const href = $(el).find('a').attr('href');
                const cover = $(el).find('img').attr('data-original') || $(el).find('img').attr('src');

                if (title && href) {
                    results.push({
                        title: title,
                        url: href.startsWith('http') ? href : `${baseUrl}${href}`,
                        cover: cover ? (cover.startsWith('http') ? cover : `${baseUrl}${cover}`) : ''
                    });
                }
            });

            return results;
        } catch (e) {
            return [];
        }
    },

    // 3. 获取详情与剧集列表
    async getDetail(url) {
        const res = await fetch(url);
        const html = await res.text();
        const $ = cheerio.load(html);

        const title = $('h1, .title').text().trim();
        const description = $('.content, .detail-content, .text-collapse').text().trim();
        const cover = $('.myui-content__thumb img, .detail-pic img').attr('data-original') || $('.myui-content__thumb img').attr('src');

        const episodes = [];
        $('.myui-content__list sort-list a, .anthology-list-play a, .play_list_box a').each((_, el) => {
            const epUrl = $(el).attr('href');
            episodes.push({
                name: $(el).text().trim(),
                url: epUrl.startsWith('http') ? epUrl : `${baseUrl}${epUrl}`
            });
        });

        return { title, description, cover, episodes };
    },

    // 4. 获取播放地址
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
