// HY Melolo API

// Helper kecil untuk error upstream
function upstreamError(res, resp) {
  return res.status(resp.status).json({
    error: 'Upstream HTTP error',
    status: resp.status,
    body: typeof resp.data === 'string' ? resp.data : undefined,
  });
}

// Random ticket
function generate_rticket() {
  return String(BigInt(`0x${crypto.randomUUID().replace(/-/g, '')}`) >> BigInt(64));
}

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const heicConvert = require('heic-convert');
const app = express();
const PORT = process.env.PORT || 8006;

// ============================================================
// Basic configuration
// ============================================================

const DEFAULT_HOST = 'api.tmtreader.com';
const BASE_URL = `https://${DEFAULT_HOST}`;
const ALLOWED_ORIGINS = [
  // development
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://melolotv.net',
  'https://duniadrama.vercel.app',
  'https://dramakita-ochre.vercel.app',
  // live
]
const CELL_IDS = {
  trending: '7450059162446200848',
  latest: '7470064000445710353',
}
const commonHeaders = {
  Host: this.DEFAULT_HOST,
  //Accept: 'application/json; charset=utf-8,application/x-protobuf',
  'X-Xs-From-Web': 'false',
  'Age-Range': '8',
  'Sdk-Version': '2',
  'Passport-Sdk-Version': '50357',
  'X-Vc-Bdturing-Sdk-Version': '2.2.1.i18n',
  'User-Agent': 'com.worldance.drama/49819 (Linux; U; Android 9; in; SM-N976N; Build/QP1A.190711.020;tt-ok/3.12.13.17)',
}
const commonParams = {
  iid: '7549249992780367617',
  device_id: '6944790948585719298',
  ac: 'wifi',
  channel: 'gp',
  aid: '645713',
  app_name: 'Melolo',
  version_code: '49819',
  version_name: '4.9.8',
  device_platform: 'android',
  os: 'android',
  ssmix: 'a',
  device_type: 'SM-N976N',
  device_brand: 'samsung',
  language: 'in',
  os_api: '28',
  os_version: '9',
  openudid: '707e4ef289dcc394',
  manifest_version_code: '49819',
  resolution: '900*1600',
  dpi: '320',
  update_version_code: '49819',
  current_region: 'ID',
  carrier_region: 'ID',
  app_language: 'id',
  sys_language: 'in',
  app_region: 'ID',
  sys_region: 'ID',
  mcc_mnc: '46002',
  carrier_region_v2: '460',
  user_language: 'id',
  time_zone: 'Asia/Bangkok',
  ui_language: 'in',
  cdid: 'a854d5a9-b6cd-4de7-9c43-8310f5bf513c',
}

// ============================================================
// Middleware
// ============================================================

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}));
//app.use(express.json());

// ============================================================
// Proxy-img
// ============================================================
// GET /proxy-img?url=<BASE_URL>&x-expires=...&x-signature=...

app.get('/proxy-img', express.json(), async (req, res) => {
  const { url, ...rest } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Parameter ?url wajib diisi!' });
  }

  // Regenerate full URL 
  let target = String(url);
  const extraParams = new URLSearchParams();

  for (const [key, value] of Object.entries(rest)) {
    if (Array.isArray(value)) {
      for (const v of value) extraParams.append(key, String(v));
    } else if (value !== undefined) {
      extraParams.append(key, String(value));
    }
  }

  const extraQuery = extraParams.toString();
  if (extraQuery) {
    target += (target.includes('?') ? '&' : '?') + extraQuery;
  }

  try {
    const headers = {
      'User-Agent': 'python-httpx/0.28.1',
      Accept: '*/*',
    };

    const upstream = await axios.get(target, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers,
      validateStatus: () => true, // jangan thrown error 4xx/5xx
    });

    const status = upstream.status;
    const contentType =
      upstream.headers['content-type'] || 'application/octet-stream';
    const buffer = Buffer.from(upstream.data || []);

    // If failed, just continue as it is
    if (status !== 200) {
      console.warn(`proxy-img status ${status} for ${target.slice(0, 120)}`);
      res.status(status);
      res.setHeader('Content-Type', contentType);
      return res.send(buffer);
    }

    const isHeic =
      contentType.includes('heic') ||
      contentType.includes('heif') ||
      target.toLowerCase().includes('.heic');

    // === PATH UTAMA: HEIC → JPEG pakai heic-convert ===
    if (isHeic) {
      try {
        const outputBuffer = await heicConvert({
          buffer,
          format: 'JPEG',
          quality: 0.75, // kompromi ukuran vs kualitas
        });

        res.status(200);
        res.setHeader('Content-Type', 'image/jpeg');
        // jangan pakai attachment biar nggak ke-download
        return res.send(Buffer.from(outputBuffer));
      } catch (e) {
        console.warn('HEIC convert gagal, kirim raw HEIC:', e.message);
        // fallback: kirim HEIC mentah (kalau benar2 kepepet)
        res.status(200);
        res.setHeader('Content-Type', contentType);
        return res.send(buffer);
      }
    }

    // Bukan HEIC → passthrough biasa
    res.status(200);
    res.setHeader('Content-Type', contentType);
    return res.send(buffer);
  } catch (err) {
    console.error('proxy-img fatal error:', err.message);
    return res.status(500).json({
      error: 'Proxy error',
      detail: err.message,
    });
  }
});

// ============================================================
// Trending Bookmall
// ============================================================
app.get(['/bookmall', '/bookmall/trending', '/trending'], express.json(), async (_req, res) => {
  try {
    const headers = commonHeaders;
    const params = commonParams;
    params.tab_scene = '3';
    params.tab_type = '0';
    params.limit = '0';
    params.start_offset = '0';
    params.cell_id = CELL_IDS.trending;
    params._rticket = generate_rticket();

    const resp = await axios.get(
      `${BASE_URL}/i18n_novel/bookmall/cell/change/v1/`,
      { headers, params, timeout: 30000 },
    );

    if (resp.status !== 200) {
      return upstreamError(res, resp);
    }

    const data = resp.data;

    if (data.code && data.code !== 0) {
      return res.status(400).json({
        error: data.message || 'Upstream returned non-zero code',
      });
    }

    // Di FastAPI: return data["data"]
    return res.json(data.data || {});
  } catch (err) {
    console.error('/bookmall error:', err.message);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
});

// ============================================================
// Latest Bookmall
// ============================================================

app.get(['/bookmall/latest', '/latest'], express.json(), async (_req, res) => {
  try {
    const headers = commonHeaders;
    const params = commonParams;
    params.tab_scene = '3';
    params.tab_type = '0';
    params.limit = '0';
    params.start_offset = '0';
    params.cell_id = CELL_IDS.latest;
    params._rticket = generate_rticket();

    const resp = await axios.get(
      `${BASE_URL}/i18n_novel/bookmall/cell/change/v1/`,
      { headers, params, timeout: 30000 },
    );

    if (resp.status !== 200) {
      return upstreamError(res, resp);
    }

    const data = resp.data;

    if (data.code && data.code !== 0) {
      return res.status(400).json({
        error: data.message || 'Upstream returned non-zero code',
      });
    }

    // Di FastAPI: return data["data"]
    return res.json(data.data || {});
  } catch (err) {
    console.error('/bookmall error:', err.message);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
});

// ============================================================
// Search 
// ============================================================

app.get('/search', express.json(), async (req, res) => {
  const query = req.query.query;
  if (!query) {
    return res.status(400).json({ error: 'Parameter ?query wajib diisi' });
  }

  try {
    const headers = commonHeaders;
    const params = commonParams;
    params.query = query;
    params.limit = '0';
    params.offset = '0';
    params._rticket = generate_rticket();

    const resp = await axios.get(
      `${BASE_URL}/i18n_novel/search/page/v1/`,
      { headers, params, timeout: 30000 },
    );

    if (resp.status !== 200) {
      return upstreamError(res, resp);
    }

    const data = resp.data;

    if (data.code && data.code !== 0) {
      return res.status(400).json({
        error: data.message || 'Upstream returned non-zero code',
      });
    }

    const searchData = (data.data?.search_data || []);
    const items = [];

    for (const cell of searchData) {
      for (const book of (cell.books || [])) {
        //console.log(book);
        // items.push({
        //   book_id: book.book_id,
        //   title: book.book_name,
        //   author: book.author,
        //   abstract: book.abstract,
        //   cover: book.thumb_url,
        //   status: book.show_creation_status,
        //   age_gate: book.age_gate,
        //   read_count: book.read_count,
        //   language: book.language,
        //   source: book.source,
        //   create_time: book.create_time,
        //   language: book.language,
        //   is_new: book.is_new,
        // });
        items.push(book);
      }
    }

    return res.json({
      query: data.data?.query_word,
      total: items.length,
      items,
    });
  } catch (err) {
    console.error('/search error:', err.message);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
});

// ============================================================
// Series Detail
// ============================================================

app.get('/series', express.json(), async (req, res) => {
  const seriesId = req.query.series_id;
  if (!seriesId) {
    return res.status(400).json({ error: 'Parameter ?series_id wajib diisi' });
  }

  try {
    const headers = commonHeaders;
    const params = commonParams;
    params._rticket = generate_rticket();

    const jsonData = {
      biz_param: {
        detail_page_version: 0,
        from_video_id: '',
        need_all_video_definition: false,
        need_mp4_align: false,
        source: 4,
        use_os_player: false,
        video_id_type: 1,
      },
      series_id: String(seriesId),
    };

    const resp = await axios.post(
      `${BASE_URL}/novel/player/video_detail/v1/`,
      jsonData,
      { headers, params, timeout: 30000 },
    );

    if (resp.status !== 200) {
      return upstreamError(res, resp);
    }

    const data = resp.data;
    const baseResp = data.BaseResp || {};

    if (baseResp.StatusCode !== 0 && baseResp.StatusCode != null) {
      return res.status(400).json({
        error: baseResp.StatusMessage || 'Upstream base error',
      });
    }

    const videoData = (data.data || {}).video_data || {};

    const seriesInfo = {
      series_id: videoData.series_id,
      title: videoData.series_title,
      intro: videoData.series_intro,
      episode_count: videoData.episode_cnt,
      episode_text: videoData.episode_right_text,
      play_count: videoData.series_play_cnt,
      cover: videoData.series_cover,
      status: videoData.series_status,
    };

    const episodes = [];
    for (const v of (videoData.video_list || [])) {
      episodes.push({
        index: v.vid_index,
        vid: v.vid,
        duration: v.duration,
        likes: v.digged_count,
        cover: v.episode_cover,
        vertical: v.vertical,
        disclaimer: (v.disclaimer_info || {}).content,
      });
    }

    const vidList = episodes
      .map((e) => e.vid)
      .filter(Boolean);

    return res.json({
      series: seriesInfo,
      episodes,
      vid_list: vidList,
    });
  } catch (err) {
    console.error('/series error:', err.message);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
});

// ============================================================
// Video Model
// ============================================================

app.get('/video', express.json(), async (req, res) => {
  const videoId = req.query.video_id;
  if (!videoId) {
    return res.status(400).json({ error: 'Parameter ?video_id wajib diisi' });
  }

  try {
    const headers = commonHeaders;
    const params = commonParams;
    params._rticket = generate_rticket();

    const jsonData = {
      biz_param: {
        detail_page_version: 0,
        device_level: 3,
        from_video_id: '',
        need_all_video_definition: true,
        need_mp4_align: false,
        source: 4,
        use_os_player: false,
        video_id_type: 0,
        video_platform: 3,
      },
      video_id: String(videoId),
    };

    const resp = await axios.post(
      `${BASE_URL}/novel/player/video_model/v1/`,
      jsonData,
      { headers, params, timeout: 30000 },
    );

    if (resp.status !== 200) {
      return upstreamError(res, resp);
    }

    const data = resp.data;
    const baseResp = data.BaseResp || {};

    if (baseResp.StatusCode !== 0 && baseResp.StatusCode != null) {
      return res.status(400).json({
        error: baseResp.StatusMessage || 'Upstream base error',
      });
    }

    const summary = {
      duration: data.data?.duration,
      video_id: String(videoId),
    };

    return res.json({
      summary,
      raw: data,
    });
  } catch (err) {
    console.error('/video error:', err.message);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
});

app.get('/video-url', async (req, res) => {
  const videoId = req.query.video_id;
  if (!videoId) {
    return res.status(400).send('Parameter ?video_id wajib diisi');
  }

  try {
    const headers = commonHeaders;
    const params = commonParams;
    params._rticket = generate_rticket();

    const jsonData = {
      biz_param: {
        detail_page_version: 0,
        device_level: 3,
        from_video_id: '',
        need_all_video_definition: true,
        need_mp4_align: false,
        source: 4,
        use_os_player: false,
        video_id_type: 0,
        video_platform: 3,
      },
      video_id: String(videoId),
    };

    const resp = await axios.post(
      `${BASE_URL}/novel/player/video_model/v1/`,
      jsonData,
      { headers, params, timeout: 30000 },
    );

    if (resp.status !== 200) {
      return upstreamError(res, resp);
    }

    const data = resp.data;
    const baseResp = data.BaseResp || {};

    if (baseResp.StatusCode !== 0 && baseResp.StatusCode != null) {
      return res.status(400).json({
        error: baseResp.StatusMessage || 'Upstream base error',
      });
    }

    const summary = {
      duration: data.data?.duration,
      video_id: String(videoId),
    };

    return res.status(200).sendFile(data.data.main_url);
  } catch (err) {
    console.error('/video error:', err.message);
    return res.status(500).send(`Internal error: ${err.message}`);
  }
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log(`HY Melolo API running on http://0.0.0.0:${PORT}`);
});