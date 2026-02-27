# ArtadoProxy

Çoklu motorlu meta-arama proxy servisi ve scraper aggregator

---

## Hakkında

ArtadoProxy, birden fazla arama motorundan sonuçları bir araya getiren, gizlilik odaklı ve yüksek performanslı bir meta-arama aracıdır. TypeScript ile geliştirilmiş olup, çeşitli arama motorlarını eş zamanlı olarak tarayarak temiz ve normalize edilmiş veriler sunar.

## Desteklenen Arama Motorları

- **Google** - Web arama sonuçları
- **DuckDuckGo** - Gizlilik odaklı arama
- **Brave** - Modern arama motoru
- **Startpage** - Gizlilik odaklı meta-arama
- **Qwant** - Avrupa merkezli arama motoru
- **Mojeek** - İngiltere merkezli arama motoru
- **Ask** - Klasik arama motoru
- **Marginalia** - Niche ve alternatif içerik odaklı

---

## API Uç Noktaları

### Web Arama
```
GET /search
```

#### Parametreler

| Parametre | Tip | Varsayılan | Açıklama |
|-----------|------|------------|-----------|
| q | string | Zorunlu | Arama sorgusu |
| engines | string | Tüm motorlar | Virgülle ayrılmış motor listesi (örn: "google,duckduckgo,brave") |
| limitTotal | number | 20 | Toplam sonuç sayısı (maks: 200) |
| limitPerEngine | number | 5 | Her motor için sonuç sayısı (maks: 20) |
| pageno | number | 1 | Sayfa numarası |
| offset | number | - | Sonuç başlangıç ofseti (pageno'yu geçersiz kılar) |
| region | string | - | Bölge kodu (örn: "tr", "us") |
| includeDomains | string | - | Sadece belirli domain'leri dahil et (virgülle ayrılmış) |
| excludeDomains | string | - | Belirli domain'leri hariç tut (virgülle ayrılmış) |
| cache | string | "1" | Önbellek kullanımı ("1" veya "0") |
| timeoutMs | number | 12000 | İstek zaman aşımı süresi (milisaniye) |

#### Örnek İstek
```
GET /search?q=typescript&engines=google,duckduckgo&limitTotal=10&region=tr
```

#### Yanıt Formatı
```json
{
  "query": "typescript",
  "engines": ["google", "duckduckgo"],
  "limitTotal": 10,
  "limitPerEngine": 5,
  "pageno": 1,
  "count": 8,
  "results": [
    {
      "engine": "google",
      "title": "TypeScript: JavaScript That Scales",
      "url": "https://www.typescriptlang.org/",
      "snippet": "TypeScript is a strongly typed programming language that builds on JavaScript..."
    }
  ],
  "errors": [
    {
      "engine": "duckduckgo",
      "message": "timeout_error"
    }
  ]
}
```

### Görsel Arama
```
GET /search/images
```

#### Parametreler

| Parametre | Tip | Varsayılan | Açıklama |
|-----------|------|------------|-----------|
| q | string | Zorunlu | Arama sorgusu |
| limitTotal | number | 50 | Toplam sonuç sayısı (maks: 200) |
| pageno | number | 1 | Sayfa numarası |
| cache | string | "1" | Önbellek kullanımı ("1" veya "0") |

#### Örnek İstek
```
GET /search/images?q=nature&limitTotal=20
```

### Video Arama
```
GET /search/videos
```

#### Parametreler

| Parametre | Tip | Varsayılan | Açıklama |
|-----------|------|------------|-----------|
| q | string | Zorunlu | Arama sorgusu |
| limitTotal | number | 30 | Toplam sonuç sayısı (maks: 100) |
| pageno | number | 1 | Sayfa numarası |
| cache | string | "1" | Önbellek kullanımı ("1" veya "0") |

### Haber Arama
```
GET /search/news
```

#### Parametreler

| Parametre | Tip | Varsayılan | Açıklama |
|-----------|------|------------|-----------|
| q | string | Zorunlu | Arama sorgusu |
| limitTotal | number | 30 | Toplam sonuç sayısı (maks: 100) |
| pageno | number | 1 | Sayfa numarası |
| cache | string | "1" | Önbellek kullanımı ("1" veya "0") |

### Durum ve Sağlık

#### Servis Durumu
```
GET /status
```

HTML formatında detaylı servis durumu sayfası döner. Motor sağlığı, istatistikler ve sistem bilgilerini içerir.

#### Sağlık Kontrolü
```
GET /health
```

JSON formatında servis sağlığı bilgisi döner.

#### Yanıt Formatı
```json
{
  "ok": true,
  "service": "proxy",
  "now": "2026-02-27T10:33:11.291Z",
  "runtime": {
    "node": "v20.19.2",
    "pid": 25350,
    "platform": "linux",
    "arch": "x64",
    "uptimeSec": 171
  },
  "engines": {
    "supported": ["duckduckgo", "google", "brave", "startpage", "qwant", "mojeek", "ask", "marginalia"],
    "health": {
      "google": {
        "totalRequests": 10,
        "totalErrors": 2,
        "totalResults": 45,
        "avgResponseTime": 850.5,
        "lastSuccess": "2026-02-27T10:30:00.000Z",
        "lastError": "2026-02-27T10:32:00.000Z",
        "lastErrorMessage": "blocked_or_captcha"
      }
    }
  },
  "memory": {
    "rss": 109563904,
    "heapTotal": 27860992,
    "heapUsed": 20077608,
    "external": 5106692
  }
}
```

---

## Kurulum

### Gereksinimler
- Node.js 20.x
- npm veya yarn

### Adımlar

1. Depoyu klonlayın:
```bash
git clone https://github.com/Sxinar/artstelve-proxy.git
cd artstelve-proxy
```

2. Bağımlılıkları yükleyin:
```bash
npm install
```

3. Ortam değişkenlerini yapılandırın:
```bash
cp .env.example .env
# .env dosyasını düzenleyin
```

4. Geliştirme modunda başlatın:
```bash
npm run dev
```

5. Üretim için build alın:
```bash
npm run build
npm start
```

---

## Yapılandırma

### Ortam Değişkenleri

`.env` dosyasında aşağıdaki ayarları yapılandırabilirsiniz:

| Değişken | Varsayılan | Açıklama |
|----------|------------|-----------|
| PORT | 8787 | Uygulamanın çalışacağı port |
| NODE_ENV | development | Çalışma ortamı (development/production) |
| GLOBAL_ENGINE_CONCURRENCY | 10 | Aynı anda yapılabilecek toplam motor isteği |
| PER_ENGINE_CONCURRENCY | 3 | Her motor için eş zamanlı istek sınırı |
| GITHUB_CLIENT_ID | - | GitHub OAuth (admin panel için) |
| GITHUB_CLIENT_SECRET | - | GitHub OAuth (admin panel için) |

### Motor Yapılandırması

Her motor kendi içinde özel yapılandırmalara sahiptir:
- User-Agent rotasyonu
- İstek başlıkları
- Zaman aşımı süreleri
- Hata yönetimi

---

## Hata Yönetimi

### Hata Türleri

| Hata Kodu | Açıklama |
|------------|-----------|
| blocked_or_captcha | Motor tarafından engellendi veya captcha |
| timeout_error | İstek zaman aşımına uğradı |
| no_results_or_selector_mismatch | Sonuç bulunamadı veya HTML yapısı değişti |
| network_error | Ağ bağlantı hatası |
| invalid_response | Geçersiz yanıt formatı |

### Hata Yönetimi Stratejisi

1. **Otomatik Yeniden Deneme**: Başarısız motorlar otomatik olarak yeniden denenir
2. **Fallback**: Bir motor başarısız olduğunda diğer motorların sonuçları kullanılır
3. **Health Monitoring**: Motor sağlığı sürekli izlenir
4. **Graceful Degradation**: Kısmi sonuçlar döndürerek hizmet kesintisi önlenir

---

## Performans Optimizasyonu

### Önbellek Stratejisi
- LRU (Least Recently Used) önbellek mekanizması
- Yapılandırılabilir önbellek boyutu
- Otomatik önbellek temizleme

### Eş Zamanlı İstek Yönetimi
- Promise tabanlı eş zamanlı istekler
- Kaynak kullanımını optimize eden concurrency kontrolü
- Timeout yönetimi

### Bellek Yönetimi
- Otomatik çöp toplama optimizasyonu
- Bellek kullanım izleme
- Stream processing büyük veriler için

---

## Güvenlik

### Rate Limiting
- IP bazlı istek sınırlaması
- Motor başına özel limitler
- DDoS koruması

### Gizlilik
- Kullanıcı verisi saklanmaz
- Loglama minimal tutulur
- HTTPS zorunluluğu (production)

---

## Dağıtım

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 8787
CMD ["npm", "start"]
```

### Vercel
Projeyi Vercel'e deploy etmek için:
```bash
npm install -g vercel
vercel
```

### Kendi Sunucunuzda
```bash
# PM2 ile process management
npm install -g pm2
pm2 start ecosystem.config.js
```

---

## Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun: `git checkout -b feature/yeni-ozellik`
3. Değişiklikleri commit edin: `git commit -am 'Yeni özellik eklendi'`
4. Push yapın: `git push origin feature/yeni-ozellik`
5. Pull request oluşturun

---

## Lisans

MIT License - detaylar için LICENSE dosyasına bakın.

---

## Destek

Sorunlar ve öneriler için:
- GitHub Issues: https://github.com/Sxinar/artstelve-proxy/issues
