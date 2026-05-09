# Artado Proxy

Artado Proxy is an API that allows users to search the web more privately by sending requests to other search engines, retrieving the results, and parsing them as JSON. This proxy enhances privacy by ensuring that search queries are routed through the proxy rather than directly to search engines. Users can self-host their own proxy and add it to Artado, making it available for others to use as well.

## Features

- Web search via Google (Startpage proxy) and Bing
- Image search via Bing
- News search via Bing News RSS
- Video search via Bing Videos
- Retrieves and parses all results as JSON
- Enhances user privacy by proxying search queries
- Allows for self-hosted deployment

## Self-Hosting Instructions

### Deploy to Repl.it

[![Import to Repl.it](https://img.shields.io/website?color=044A10&down_message=Import%20to%20Replit&label=%20&logo=replit&up_message=Import%20to%20Replit&url=https%3A%2F%2Freplit.com)](https://replit.com/new/github/Artado-Project/ArtadoProxy)

<!--
### Deploy with Workers

[![Deploy with Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Artado-Project/ArtadoProxy)

### Deploy to Heroku

[![Deploy with Heroku](https://www.herokucdn.com/deploy/button.svg)](https://www.heroku.com/deploy?template=https://github.com/Artado-Project/ArtadoProxy)
-->
### Prerequisites

- Node.js and npm installed
- TypeScript installed globally (`npm install -g typescript`)

### Steps

1. **Clone the Repository**

   ```bash
   git clone https://github.com/Artado-Project/ArtadoProxy
   cd ArtadoProxy
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Compile TypeScript**

   ```bash
   tsc
   ```

4. **Run the Server**

   ```bash
   npm start
   ```

5. **Access the Proxy**

   The proxy will be running at `http://localhost:3000`.

## API Endpoints

### Web Search — `GET /api`

```
http://localhost:3000/api?q={query}&number={count}&source={source}
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `q` | ✅ | Search query |
| `number` | ✅ | Number of results (1–50) |
| `source` | ✅ | `google`, `bing`, or `all` |

**Example:**
```
http://localhost:3000/api?q=artado&number=10&source=google
```

**Response fields:** `title`, `description`, `displayUrl`, `url`, `source`

---

### Image Search — `GET /api/images`

```
http://localhost:3000/api/images?q={query}&number={count}
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `q` | ✅ | Search query |
| `number` | ❌ | Number of results (default: 10, max: 50) |

**Example:**
```
http://localhost:3000/api/images?q=mountains&number=10
```

**Response fields:** `title`, `url` (full image URL), `thumbnailUrl`, `sourceUrl`, `source`

---

### News Search — `GET /api/news`

```
http://localhost:3000/api/news?q={query}&number={count}
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `q` | ✅ | Search query |
| `number` | ❌ | Number of results (default: 10, max: 50) |

**Example:**
```
http://localhost:3000/api/news?q=technology&number=10
```

**Response fields:** `title`, `description`, `url`, `displayUrl`, `publishedAt`, `newsSource`, `thumbnailUrl`, `source`

---

### Video Search — `GET /api/videos`

```
http://localhost:3000/api/videos?q={query}&number={count}
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `q` | ✅ | Search query |
| `number` | ❌ | Number of results (default: 10, max: 50) |

**Example:**
```
http://localhost:3000/api/videos?q=nature&number=10
```

**Response fields:** `title`, `url`, `thumbnailUrl`, `duration`, `publisher`, `source`

---

### Status — `GET /status`

Returns `OK` or `BUSY` based on current request load.

## License

This project is licensed under the AGPL v3 License.

---

Feel free to contribute or report issues to make this proxy even better!
