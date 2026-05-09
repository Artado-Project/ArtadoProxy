export interface Results {
    title: string;
    description: string;
    displayUrl: string;
    url: string;
    source: string;
}

export interface ImageResult {
    title: string;
    url: string;
    thumbnailUrl: string;
    sourceUrl: string;
    source: string;
}

export interface NewsResult {
    title: string;
    description: string;
    url: string;
    displayUrl: string;
    publishedAt: string;
    newsSource: string;
    thumbnailUrl: string;
    source: string;
}

export interface VideoResult {
    title: string;
    url: string;
    thumbnailUrl: string;
    duration: string;
    publisher: string;
    source: string;
}