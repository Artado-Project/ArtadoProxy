import express, { Request, Response, NextFunction } from 'express';
import bodyParser from "body-parser";
import cors from "cors";
import axios from "axios";
import { load } from "cheerio";
import { Results } from "./results";
import * as iconv from 'iconv-lite';

const app = express();

let requestCount = 0;
const REQUEST_THRESHOLD = 100;
const RESET_INTERVAL = 5 * 60 * 60 * 1000;

const requestCounter = (req: Request, res: Response, next: NextFunction) => {
    if (req.url.startsWith('/api')) {
        requestCount++;
        console.log(`Request count: ${requestCount}`);
    }
    next();
};

app.use(requestCounter);
app.use(cors());
app.use(bodyParser.json());

async function getGoogle(q, n): Promise<Results[]> {
    const results: Results[] = [];

    const response = await axios.get("https://www.google.com/search?q=" + q + "&start=" + n , {
        responseType: 'arraybuffer'
    });
    const html = iconv.decode(Buffer.from(response.data), 'ISO-8859-1');
    console.log(html);

    const $ = load(html);

    $("div.Gx5Zad.fP1Qef.xpd.EtOod.pkphOe").each((div, productHTMLElement) => {
        const title: string = $(productHTMLElement).find("div.BNeawe.vvjwJb.AP7Wnd").text() as string;
        const displayUrl: string = $(productHTMLElement).find("div.BNeawe.UPmit.AP7Wnd.lRVwie").text() as string;
        const description: string = $(productHTMLElement).find("div.BNeawe.s3v9rd.AP7Wnd").text() as string;

        const urlnospace = displayUrl.replace(/ /g, '');
        let url = urlnospace.replace(/›/g, '');

        if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
        }

        if (!url.endsWith('/')) {
            url += '/';
        }

        const result: Results = {
            title: title,
            description: description,
            displayUrl: displayUrl,
            url: url,
            source: "Google"
        };
        results.push(result);
    });

    for (const result of results) {
        console.log(result.title)
        console.log(result.description)
        console.log(result.url)
        console.log(`\n`)
    }


    return results;
}

async function getBing(q, n): Promise<Results[]> {
    const results: Results[] = [];

    const response = await axios.get("https://www.bing.com/search?q=" + q + "&start=" + n, {
        responseType: 'arraybuffer'
    });
    const html = response.data;
    console.log(html);

    const $ = load(html);

    $("li.b_algo").each((div, productHTMLElement) => {
        const title: string = $(productHTMLElement).find("li.b_algo h2 a").text() as string;
        const displayUrl: string = $(productHTMLElement).find("div.b_attribution").text() as string;
        const desc: string = $(productHTMLElement).find("p.b_lineclamp4.b_algoSlug").text() as string;

        const urlnospace = displayUrl.replace(/ /g, '');
        let url = urlnospace.replace(/›/g, '');

        if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
        }

        if (!url.endsWith('/')) {
            url += '/';
        }

        const description = desc.substring(2);

        const result: Results = {
            title: title,
            description: description,
            displayUrl: displayUrl,
            url: url,
            source: "Bing"
        };
        results.push(result);
    });

    for (const result of results) {
        console.log(result.title)
        console.log(result.description)
        console.log(result.url)
        console.log(`\n`)
    }


    return results;
}

async function getAll(json1: Results[], json2: Results[]): Promise<Results[]> {
    const map = new Map<string, Results>();

    console.log('Adding items from json1:');
    json1.forEach(item => {
        console.log(`Adding: ${item.title}`);
        map.set(item.title, item);
    });

    console.log('Adding items from json2:');
    json2.forEach(item => {
        if (!map.has(item.title)) {
            console.log(`Adding: ${item.title}`);
            map.set(item.title, item);
        } else {
            console.log(`Skipping duplicate: ${item.title}`);
        }
    });

    const results: Results[] = Array.from(map.values());

    return results;
}


app.get("/", (req, res) => {
    return res.status(200).send({ response: "Artado Proxy is running!" });
});

app.get("/api", async (req, res) => {
    try {
        const query = req.query.q as string;
        console.log(query);

        const n = req.query.number as string;
        console.log(n);

        const querysource = req.query.source as string;
        const source = querysource.toLowerCase();

        let results;

        switch (source) {
            case "google":
                results = await getGoogle(query, n);
                break;
            case "bing":
                results = await getBing(query, n);
                break;
            case "all":
                const bing = await getBing(query, n);
                const google = await getGoogle(query, n);
                results = await getAll(google, bing);
        }

        res.setHeader('Content-Type', 'application/json; charset=UTF-8');
        return res.status(200).json(results);
    } catch (error) {
        console.error(error);
        return res.status(500).send("Internal Server Error");
    }
})

app.get('/status', (req: Request, res: Response) => {
    const status = requestCount > REQUEST_THRESHOLD ? 'BUSY' : 'OK';
    res.send(status);
});

setInterval(() => {
    requestCount = 0;
    console.log('Request count reset to 0');
}, RESET_INTERVAL);

app.listen(3000, () => {
    console.log("Server running on port 3000");
});