import { parseStringPromise } from 'xml2js';
import fetch from 'node-fetch';

// Helper: Fetch News for Interest (Returns ARRAY of top 5)
export async function fetchNewsForInterest(interest) {
    try {
        // TOPIC MAP
        const TOPICS = {
            "business": "BUSINESS",
            "technology": "TECHNOLOGY",
            "science": "SCIENCE",
            "health": "HEALTH",
            "world": "WORLD",
            "world news": "WORLD",
            "politics": "NATION",
            "entertainment": "ENTERTAINMENT",
            "sports": "SPORTS"
        };

        const key = interest.toLowerCase();
        let rssUrl = "";

        if (TOPICS[key]) {
            rssUrl = `https://news.google.com/rss/headlines/section/topic/${TOPICS[key]}?hl=en-US&gl=US&ceid=US:en`;
            console.log(`[News Source] Using Topic Feed for ${interest}: ${TOPICS[key]}`);
        } else {
            const encoded = encodeURIComponent(interest);
            rssUrl = `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`;
            console.log(`[News Source] Using Search Feed for ${interest}`);
        }

        const res = await fetch(rssUrl);
        const xml = await res.text();
        const parsed = await parseStringPromise(xml);

        if (!parsed.rss || !parsed.rss.channel || !parsed.rss.channel[0].item) {
            return [];
        }

        const items = parsed.rss.channel[0].item;
        if (items.length === 0) return [];

        const TRUSTED_SOURCES = [
            "BBC", "CNN", "Reuters", "The New York Times", "Bloomberg",
            "TechCrunch", "The Verge", "Wired", "Nature", "Science",
            "The Wall Street Journal", "Forbes", "The Guardian", "CNBC",
            "NPR", "National Geographic", "Scientific American", "The Economist",
            "Harvard Business Review", "MIT Technology Review"
        ];

        const formattedItems = items.map(item => ({
            title: item.title[0],
            link: item.link[0],
            pubDate: item.pubDate ? item.pubDate[0] : new Date().toISOString(),
            source: item.source ? item.source[0]._ : "Google News",
            sourceUrl: item.source ? item.source[0].$.url : ""
        }));

        const trusted = formattedItems.filter(i => TRUSTED_SOURCES.some(t => i.source.includes(t)));
        const others = formattedItems.filter(i => !TRUSTED_SOURCES.some(t => i.source.includes(t)));
        let candidates = [...trusted, ...others];

        const seen = new Set();
        const unique = [];
        for (const c of candidates) {
            if (!seen.has(c.title)) {
                seen.add(c.title);
                unique.push(c);
            }
        }

        return unique.slice(0, 5);

    } catch (e) {
        console.error('News fetch failed:', e);
        return [];
    }
}

export async function fetchArticleContent(url) {
    try {
        const res = await fetch(url);
        const html = await res.text();
        return html.replace(/<script[^>]*>([\S\s]*?)<\/script>/gmi, "")
            .replace(/<style[^>]*>([\S\s]*?)<\/style>/gmi, "")
            .replace(/<[^>]+>/g, "\n")
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 5000);
    } catch (e) {
        return "";
    }
}
