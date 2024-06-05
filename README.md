# Artado Proxy

Artado Proxy is an API that allows users to search the web more privately by sending requests to other search engines, retrieving the results, and parsing them as JSON. This proxy enhances privacy by ensuring that search queries are routed through the proxy rather than directly to search engines. Users can self-host their own proxy and add it to Artado, making it available for others to use as well.

## Features

- Sends search requests to various search engines
- Retrieves and parses search results as JSON
- Enhances user privacy by proxying search queries
- Allows for self-hosted deployment

## Self-Hosting Instructions

### Deploy to Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/yourusername/artado-proxy)

### Deploy with Workers

[![Deploy with Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/yourusername/artado-proxy)

### Prerequisites

- Node.js and npm installed
- TypeScript installed globally (`npm install -g typescript`)

### Steps

1. **Clone the Repository**

   ```bash
   git clone https://github.com/yourusername/artado-proxy.git
   cd artado-proxy
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

   The proxy will be running at `http://localhost:3000`. You can make search requests using the following format:

   ```
   http://localhost:3000/api?q={searchquery}&number={resultCount}&source={resultsource}
   ```

   Example:

   ```
   http://localhost:3000/api?q=artado&number=10&source=google
   ```

## Parameters

- `q`: The search query.
- `number`: The number of search results to retrieve.
- `source`: The search engine source (e.g., Google, Bing).

## License

This project is licensed under the AGPL v3 License.

---

Feel free to contribute or report issues to make this proxy even better!