import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { BackgroundMode } from "@anuradev/capacitor-background-mode";
import { MediaSession } from "@capgo/capacitor-media-session";

// Native app-la (APK) plugin use aagum, browser-la normal navigator.mediaSession
const isNative = Capacitor.isNativePlatform();

// Fallback servers (dynamic list kedaikkalana idhu use aagum)
const DEFAULT_SERVERS = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yt.chocolatemoo53.com",
  "https://invidious.tiekoetter.com",
  "https://invidious.f5.si",
];

let SERVERS = [...DEFAULT_SERVERS];
let serversLoaded = false;

// Ungal PC-oda local IP (ipconfig-la IPv4 paarunga) + port 3000
// Example: "http://192.168.1.5:3000"
const BACKEND = "";

const BAD_WORDS = [
  "status", "whatsapp", "black screen", "jukebox", "mashup", "reels",
  "shorts", "karaoke", "reaction", "bgm", "ringtone", "trailer", "teaser",
  "dialogue", "8d", "slowed", "reverb", "lofi", "remix", "cover",
  "making", "promo", "first look", "glimpse", "full movie", "nonstop",
  "non stop", "collection", "top 10", "top 20", "scenes", "live stream",
  "audio launch", "audio release", "live performance", "live", "concert",
  "press meet", "interview", "behind the scenes", "event", "speech",
  "full show", "award", "stage", "rehearsal", "jam", "unplugged",
  "podcast", "review", "explained", "breakdown",
];

const BAD_REGEXES = BAD_WORDS.map((word) => ({
  word,
  regex: new RegExp(`\\b${word}\\b`, "i"),
}));

const STOP_WORDS = new Set([
  "official", "video", "videos", "lyrics", "lyric", "lyrical", "audio",
  "hd", "4k", "full", "song", "songs", "music", "movie", "film", "ft",
  "feat", "featuring", "tamil", "hindi", "telugu", "version", "the",
  "from", "new", "latest", "promo", "single",
]);

const NEW_REGEX = /\b(new|latest|recent|2k|2023|2024|2025|2026)\b/i;

let lastGoodServer = 0;

// ---------- Native (APK) background helpers ----------

// Native call fail aanaalum app crash aagaadhu
async function safe(fn) {
  try {
    return await fn();
  } catch (err) {
    console.log("Native call failed:", err);
    return null;
  }
}

// App screen-la irukkum bodhe start pannanum (Android rule), so search click-la call aagum
async function startBackgroundMode() {
  if (!isNative) return;

  await safe(() => BackgroundMode.requestNotificationsPermission());

  await safe(() =>
    BackgroundMode.enable({
      title: "My Music App",
      text: "Music play aagikittu irukku",
      channelName: "Music playback",
      silent: false,
      hidden: false,
      resume: true,
      disableWebViewOptimization: true,
    })
  );

  await safe(() => BackgroundMode.disableWebViewOptimizations());
}

// Battery optimization (oru thadava mattum kekkum)
async function askBatteryOnce() {
  if (!isNative) return;
  if (localStorage.getItem("batteryAsked")) return;

  localStorage.setItem("batteryAsked", "1");
  await safe(() => BackgroundMode.requestDisableBatteryOptimizations());
}

// ---------- Invidious helpers ----------

// Working instances list-a online-la irundhu edukkum (hardcoded servers dead aanaalum work aagum)
async function loadServers() {
  if (serversLoaded) return;
  serversLoaded = true;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(
      "https://api.invidious.io/instances.json?sort_by=type,health",
      { signal: controller.signal }
    );
    clearTimeout(timer);

    if (!res.ok) return;

    const list = await res.json();

    const fresh = list
      .filter(
        ([, info]) =>
          info && info.type === "https" && info.api === true && info.uri
      )
      .map(([, info]) => info.uri.replace(/\/$/, ""))
      .slice(0, 8);

    if (fresh.length > 0) {
      const merged = [...fresh];
      for (const s of DEFAULT_SERVERS) {
        if (!merged.includes(s)) merged.push(s);
      }
      SERVERS = merged;
      lastGoodServer = 0;
    }
  } catch (err) {
    console.log("Instance list load failed, default servers use pannuren");
  }
}

async function fetchJsonWithServer(path, exclude = new Set()) {
  for (let i = 0; i < SERVERS.length; i++) {
    const idx = (lastGoodServer + i) % SERVERS.length;
    const server = SERVERS[idx];

    if (exclude.has(server)) continue;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(server + path, {
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        console.log("Server status", server, response.status);
        continue;
      }

      const data = await response.json();
      lastGoodServer = idx;
      return { data, server };
    } catch (err) {
      console.log("Server failed:", server, err && err.message);
    }
  }

  return { data: null, server: null };
}

async function fetchJson(path) {
  const { data } = await fetchJsonWithServer(path);
  return data;
}

async function searchVideos(query, extra = "") {
  const data = await fetchJson(
    `/api/v1/search?q=${encodeURIComponent(query)}&type=video${extra}`
  );

  if (!Array.isArray(data)) return [];

  return data.filter(
    (item) => item.type === "video" && item.videoId && item.title
  );
}

async function getRelated(videoId) {
  const data = await fetchJson(`/api/v1/videos/${videoId}`);

  if (!data || !Array.isArray(data.recommendedVideos)) return [];

  return data.recommendedVideos.filter((item) => item.videoId && item.title);
}

// Audio stream URL (m4a first, Android-la nalla work aagum)
const PIPED_SERVERS = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.private.coffee",
];

// JSON-a nambaama direct audio link-ae audio.src-ku kudukkum.
// Fail aanaa onError -> handleAudioError -> adutha server try pannum.
async function getAudio(videoId, exclude) {
  if (BACKEND && !exclude.has(BACKEND)) {
    return { url: `${BACKEND}/audio/${videoId}`, server: BACKEND };
  }

  // 1) Invidious direct stream (itag 140 = m4a 128kbps)
  for (let i = 0; i < SERVERS.length; i++) {
    const server = SERVERS[(lastGoodServer + i) % SERVERS.length];
    if (exclude.has(server)) continue;

    return {
      url: `${server}/latest_version?id=${videoId}&itag=140&local=true`,
      server,
    };
  }

  // 2) Piped servers (Invidious ellaam fail aanaa)
  for (const server of PIPED_SERVERS) {
    if (exclude.has(server)) continue;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`${server}/streams/${videoId}`, {
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        exclude.add(server);
        continue;
      }

      const data = await res.json();
      const audios = (data.audioStreams || []).filter((a) => a.url);

      if (audios.length === 0) {
        exclude.add(server);
        continue;
      }

      const m4a = audios.filter((a) => (a.mimeType || "").startsWith("audio/mp4"));
      const pool = m4a.length > 0 ? m4a : audios;

      pool.sort(
        (a, b) =>
          Math.abs(Number(a.bitrate) - 128000) -
          Math.abs(Number(b.bitrate) - 128000)
      );

      return { url: pool[0].url, server };
    } catch (err) {
      exclude.add(server);
    }
  }

  return null;
}

async function getAudioOld(videoId, exclude) {
  // Own backend first (yt-dlp). Fail aanaa exclude-la serthuttu Invidious-ku poga
  if (BACKEND && !exclude.has(BACKEND)) {
    return { url: `${BACKEND}/audio/${videoId}`, server: BACKEND };
  }

  for (let attempt = 0; attempt < SERVERS.length; attempt++) {
    const { data, server } = await fetchJsonWithServer(
      `/api/v1/videos/${videoId}?local=true`,
      exclude
    );

    if (!server) return null;

    const formats = (data && data.adaptiveFormats) || [];
    const audios = formats.filter(
      (f) => f.type && f.type.startsWith("audio/") && f.url
    );

    if (audios.length === 0) {
      // Indha server-la audio illa (bot check / blocked), vera server try pannum
      exclude.add(server);
      continue;
    }

    const m4a = audios.filter((f) => f.type.startsWith("audio/mp4"));
    const pool = m4a.length > 0 ? m4a : audios;

    pool.sort(
      (a, b) =>
        Math.abs(Number(a.bitrate) - 128000) -
        Math.abs(Number(b.bitrate) - 128000)
    );

    let url = pool[0].url;

    if (url.startsWith("/")) {
      url = server + url;
    }

    return { url, server };
  }

  return null;
}

function getSongName(title) {
  const first = title.split(/[|\-–—:]/)[0];
  return first.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
}

function getMovieKey(title) {
  const parts = title.split("|").map((p) => p.trim());
  if (parts.length < 2) return "";

  const seg = parts[0].includes("-") ? parts[0].split("-").pop() : parts[1];

  return seg.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

function getTokens(text) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
  );
}

function isSameSong(a, b) {
  if (a.size === 0 || b.size === 0) return false;

  let common = 0;
  for (const w of a) {
    if (b.has(w)) common++;
  }

  return common / Math.min(a.size, b.size) >= 0.5;
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function formatTime(sec) {
  if (!sec || !isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

const styles = {
  page: {
    maxWidth: "700px",
    margin: "0 auto",
    padding: "14px",
    paddingTop: "calc(14px + env(safe-area-inset-top))",
    paddingBottom: "110px",
    fontFamily: "Arial, sans-serif",
    boxSizing: "border-box",
    width: "100%",
  },
  title: { fontSize: "24px", margin: "6px 0 14px" },
  searchRow: { display: "flex", gap: "8px" },
  input: {
    flex: 1,
    minWidth: 0,
    padding: "12px",
    fontSize: "16px",
    borderRadius: "10px",
    border: "1px solid #ccc",
    boxSizing: "border-box",
  },
  searchBtn: {
    padding: "0 18px",
    minHeight: "48px",
    fontSize: "16px",
    borderRadius: "10px",
    border: "none",
    background: "#1a73e8",
    color: "#fff",
  },
  heading: { fontSize: "18px", margin: "18px 0 8px" },
  chips: { display: "flex", flexWrap: "wrap", gap: "8px" },
  chip: {
    padding: "8px 14px",
    background: "#f2f2f2",
    borderRadius: "20px",
    fontSize: "14px",
  },
  clearBtn: {
    marginTop: "10px",
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    background: "#fff",
    fontSize: "14px",
  },
  thumb: {
    width: "100%",
    aspectRatio: "16 / 9",
    objectFit: "cover",
    borderRadius: "12px",
    background: "#000",
  },
  songTitle: { fontSize: "17px", margin: "14px 0 10px", lineHeight: 1.3 },
  controls: { display: "flex", gap: "10px", marginTop: "12px" },
  ctrlBtn: {
    flex: 1,
    minHeight: "50px",
    fontSize: "16px",
    borderRadius: "10px",
    border: "1px solid #ccc",
    background: "#f7f7f7",
  },
  status: { fontSize: "14px", color: "#555", marginTop: "10px" },
  list: { maxHeight: "280px", overflowY: "auto" },
  miniBar: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    background: "#111",
    color: "#fff",
    padding: "8px 12px",
    paddingBottom: "calc(8px + env(safe-area-inset-bottom))",
    boxShadow: "0 -4px 16px rgba(0,0,0,0.35)",
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  miniThumb: {
    width: "56px",
    height: "42px",
    objectFit: "cover",
    borderRadius: "6px",
    flexShrink: 0,
  },
  miniTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: "13px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  miniBtn: {
    width: "44px",
    height: "44px",
    fontSize: "20px",
    borderRadius: "50%",
    border: "none",
    background: "#2a2a2a",
    color: "#fff",
    flexShrink: 0,
  },
};

function App() {
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState([]);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [nextLoading, setNextLoading] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [error, setError] = useState("");
  const [needsTap, setNeedsTap] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ current: 0, total: 0 });

  const audioRef = useRef(null);

  const queueRef = useRef([]);
  const indexRef = useRef(0);
  const wantsNewRef = useRef(false);
  const fetchingRef = useRef(false);
  const queryRef = useRef("");
  const loadTokenRef = useRef(0);
  const triedRef = useRef(new Set());
  const currentServerRef = useRef(null);
  const preloadedRef = useRef(null); // { forId, song }
  const failCountRef = useRef(0);
  const audioErrCountRef = useRef(0);
  const nextRetryRef = useRef(0);
  const bgStartedRef = useRef(false);
  const lastPosRef = useRef(0);

  queueRef.current = queue;
  indexRef.current = currentIndex;

  const currentSong = queue[currentIndex];
  const currentId = currentSong ? currentSong.id : null;

  // History load
  useEffect(() => {
    try {
      const saved = localStorage.getItem("searchHistory");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setHistory(parsed);
      }
    } catch (err) {
      localStorage.removeItem("searchHistory");
    }
  }, []);

  // Background mode: first search click-la start aagum (app screen-la irukkum bodhu)
  function ensureBackground() {
    if (!isNative || bgStartedRef.current) return;
    bgStartedRef.current = true;
    startBackgroundMode().then(askBatteryOnce);
  }

  function isGood(item, playedNames, playedIds, playedTitles = []) {
    if (playedIds.has(item.videoId)) return false;

    const title = item.title.toLowerCase();

    if (
      item.lengthSeconds &&
      (item.lengthSeconds < 120 || item.lengthSeconds > 600)
    ) {
      return false;
    }

    const queryLower = queryRef.current.toLowerCase();

    for (const { word, regex } of BAD_REGEXES) {
      if (regex.test(title) && !queryLower.includes(word)) {
        return false;
      }
    }

    const tokens = getTokens(getSongName(item.title));
    if (tokens.size === 0) return false;

    if (playedNames.some((t) => isSameSong(t, tokens))) return false;

    const movieKey = getMovieKey(item.title);

    if (movieKey) {
      const sameMovieCount = playedTitles.filter(
        (t) => getMovieKey(t) === movieKey
      ).length;

      if (sameMovieCount >= 1) return false;
    }

    return true;
  }

  // Next song-a kandupidikkum (queue-la serkkaadhu, mattum return pannum)
  async function findNext() {
    const played = queueRef.current;
    const playedIds = new Set(played.map((v) => v.id));
    const playedNames = played.map((v) => getTokens(getSongName(v.title)));
    const playedTitles = played.map((v) => v.title);

    const current = played[played.length - 1];
    if (!current) return null;

    let candidates = await getRelated(current.id);

    if (wantsNewRef.current) {
      const twoYearsAgo = Date.now() - 730 * 24 * 60 * 60 * 1000;
      const recent = candidates.filter(
        (c) => !c.published || c.published * 1000 >= twoYearsAgo
      );
      if (recent.length > 0) candidates = recent;
    }

    let pick = shuffle(candidates).find((c) =>
      isGood(c, playedNames, playedIds, playedTitles)
    );

    if (!pick) {
      const artistPart = current.title.split(/[|\-–—]/).slice(1).join(" ");
      const q = (artistPart || current.title).trim();

      const results = await searchVideos(
        q,
        wantsNewRef.current ? "&date=year" : ""
      );

      pick = shuffle(results).find((c) =>
        isGood(c, playedNames, playedIds, playedTitles)
      );
    }

    return pick ? { id: pick.videoId, title: pick.title } : null;
  }

  // Current song play aagum bodhe next song-a munnadiye ready pannum
  async function preloadNext() {
    const last = queueRef.current[queueRef.current.length - 1];
    if (!last || fetchingRef.current) return;
    if (preloadedRef.current && preloadedRef.current.forId === last.id) return;

    fetchingRef.current = true;

    try {
      const song = await findNext();
      if (song) preloadedRef.current = { forId: last.id, song };
    } finally {
      fetchingRef.current = false;
    }
  }

  async function nextSong() {
    // Queue-la already next irundha adhu
    if (indexRef.current < queueRef.current.length - 1) {
      setCurrentIndex(indexRef.current + 1);
      return;
    }

    const last = queueRef.current[queueRef.current.length - 1];
    let song = null;

    // Preload aanadhu irundha adhu
    if (
      preloadedRef.current &&
      last &&
      preloadedRef.current.forId === last.id
    ) {
      song = preloadedRef.current.song;
      preloadedRef.current = null;
    } else {
      // Preload nadandhukitu irundha mudiyura varaikum wait
      let waited = 0;
      while (fetchingRef.current && waited < 8000) {
        await new Promise((r) => setTimeout(r, 200));
        waited += 200;
      }

      if (
        preloadedRef.current &&
        last &&
        preloadedRef.current.forId === last.id
      ) {
        song = preloadedRef.current.song;
        preloadedRef.current = null;
      } else {
        fetchingRef.current = true;
        setNextLoading(true);
        try {
          song = await findNext();
        } finally {
          fetchingRef.current = false;
          setNextLoading(false);
        }
      }
    }

    if (song) {
      nextRetryRef.current = 0;
      setError("");
      queueRef.current = [...queueRef.current, song];
      setQueue(queueRef.current);
      setCurrentIndex(queueRef.current.length - 1);
    } else if (nextRetryRef.current < 2) {
      // Background-la network hiccup irundha, 3 sec-la thirumba try pannum
      nextRetryRef.current += 1;
      setTimeout(() => nextSong(), 3000);
    } else {
      nextRetryRef.current = 0;
      setError("Next song kedaikkala. Marubadi Next click pannunga.");
    }
  }

  function prevSong() {
    const audio = audioRef.current;

    // 3 sec-ku mela play aanaa, current song-a first-la irundhu
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    if (indexRef.current > 0) {
      setCurrentIndex(indexRef.current - 1);
    }
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio
        .play()
        .then(() => setNeedsTap(false))
        .catch((e) => {
          console.log("Play error:", e.name, e.message);
          setNeedsTap(true);
        });
    } else {
      audio.pause();
    }
  }

  function seek(value) {
    const audio = audioRef.current;
    if (audio) audio.currentTime = Number(value);
  }

  async function loadSong(videoId) {
    const audio = audioRef.current;
    if (!audio) return;

    const token = ++loadTokenRef.current;

    setAudioLoading(true);

    const result = await getAudio(videoId, triedRef.current);

    if (token !== loadTokenRef.current) return;

    if (!result) {
      setAudioLoading(false);

      // Thodarndhu 3 song fail aanaa nirutthidum (infinite loop avoid)
      failCountRef.current += 1;

      if (failCountRef.current >= 3) {
        setError(
          "Audio load aagala. Ella servers-um fail (blocked / bot check irukkalaam). Konjam neram kazhichi try pannunga."
        );
        return;
      }

      setError("Indha song audio kedaikkala, next song-ku poren...");
      nextSong();
      return;
    }

    failCountRef.current = 0;
    currentServerRef.current = result.server;

    console.log("Playing:", result.url);

    audio.src = result.url;
    audio.load();

    audio
      .play()
      .then(() => {
        setNeedsTap(false);
        setError("");
        preloadNext();
      })
      .catch((e) => {
        console.log("Play error:", e.name, e.message);

        // NotAllowedError = autoplay block (Tap to play kaattum)
        // AbortError = vera song load aagi cancel aanadhu (ignore)
        if (e.name === "NotAllowedError") {
          setNeedsTap(true);
        } else if (e.name !== "AbortError") {
          setError("Play error: " + e.name);
          setNeedsTap(true);
        }
      });

    setAudioLoading(false);
  }

  // Song maarum bodhu audio load
  useEffect(() => {
    const audio = audioRef.current;

    if (!currentId) {
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
      }
      return;
    }

    triedRef.current = new Set();
    audioErrCountRef.current = 0;
    loadSong(currentId);
  }, [currentId]);

  // Audio error aanaa vera server try pannum
  function handleAudioError() {
    const audio = audioRef.current;

    // src illaama fire aana error-a ignore pannu
    if (!audio || !audio.getAttribute("src")) return;

    const song = queueRef.current[indexRef.current];
    if (!song) return;

    const code = audio.error ? audio.error.code : "?";
    console.log("Audio error code:", code, "server:", currentServerRef.current);

    audioErrCountRef.current += 1;

    // Ellaa servers-um try pannaachu, innum fail aana nirutthidu
    if (audioErrCountRef.current > SERVERS.length + PIPED_SERVERS.length + 2) {
      setAudioLoading(false);
      setError(`Audio play aagala (error code ${code}). Next song try pannunga.`);
      return;
    }

    if (currentServerRef.current) {
      triedRef.current.add(currentServerRef.current);
    }

    loadSong(song.id);
  }

  // Lock screen / notification controls (song maarum bodhu metadata + buttons update aagum)
  useEffect(() => {
    if (!currentSong) return;

    const artwork = [
      {
        src: `https://i.ytimg.com/vi/${currentSong.id}/hqdefault.jpg`,
        sizes: "480x360",
        type: "image/jpeg",
      },
    ];

    const play = () => {
      const a = audioRef.current;
      if (a) a.play().catch(() => setNeedsTap(true));
    };
    const pause = () => {
      const a = audioRef.current;
      if (a) a.pause();
    };

    const handlers = {
      play,
      pause,
      nexttrack: () => nextSong(),
      previoustrack: () => prevSong(),
      seekto: (d) => {
        if (audioRef.current && d && d.seekTime != null) {
          audioRef.current.currentTime = d.seekTime;
        }
      },
    };

    try {
      if (isNative) {
        safe(() =>
          MediaSession.setMetadata({
            title: currentSong.title,
            artist: "My Music App",
            artwork,
          })
        );

        Object.keys(handlers).forEach((action) => {
          safe(() =>
            MediaSession.setActionHandler({ action }, handlers[action])
          );
        });
      } else if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new window.MediaMetadata({
          title: currentSong.title,
          artist: "My Music App",
          artwork,
        });

        Object.keys(handlers).forEach((action) => {
          try {
            navigator.mediaSession.setActionHandler(action, handlers[action]);
          } catch (err) {
            // indha action browser-la support illa
          }
        });
      }
    } catch (err) {
      console.log("MediaSession error:", err);
    }
  }, [currentId]);

  // Play / pause state notification-la sync aagum
  useEffect(() => {
    const state = playing ? "playing" : "paused";

    if (isNative) {
      safe(() => MediaSession.setPlaybackState({ playbackState: state }));
    } else if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.playbackState = state;
      } catch (err) {
        // ignore
      }
    }
  }, [playing]);

  // Time update + notification seek bar position (1 sec-ku oru thadava)
  function handleTimeUpdate(e) {
    const audio = e.target;

    setTime({
      current: audio.currentTime,
      total: audio.duration,
    });

    const now = Date.now();

    if (
      now - lastPosRef.current > 1000 &&
      isFinite(audio.duration) &&
      audio.duration > 0
    ) {
      lastPosRef.current = now;

      const state = {
        duration: audio.duration,
        position: Math.min(audio.currentTime, audio.duration),
        playbackRate: 1,
      };

      if (isNative) {
        safe(() => MediaSession.setPositionState(state));
      } else if (
        "mediaSession" in navigator &&
        navigator.mediaSession.setPositionState
      ) {
        try {
          navigator.mediaSession.setPositionState(state);
        } catch (err) {
          // ignore
        }
      }
    }
  }

  const searchVideo = async (song) => {
    if (!song.trim()) {
      return;
    }

    // Background play-kku foreground service start (user click-la thaan start aaganum)
    ensureBackground();

    setLoading(true);
    setError("");
    setQueue([]);
    setCurrentIndex(0);

    queueRef.current = [];
    indexRef.current = 0;
    queryRef.current = song;
    preloadedRef.current = null;
    failCountRef.current = 0;
    audioErrCountRef.current = 0;
    nextRetryRef.current = 0;

    // Working servers list load (first time mattum)
    await loadServers();

    const wantsNew = NEW_REGEX.test(song);
    wantsNewRef.current = wantsNew;

    let results = await searchVideos(song, wantsNew ? "&date=year" : "");

    if (results.length === 0 && wantsNew) {
      results = await searchVideos(song, "");
    }

    const first =
      results.find((r) => isGood(r, [], new Set(), [])) || results[0];

    if (first) {
      const firstSong = { id: first.videoId, title: first.title };
      queueRef.current = [firstSong];
      setQueue([firstSong]);
    } else {
      setError("Song search failed. Try again.");
    }

    setLoading(false);
  };

  const handleSearch = async () => {
    if (!search.trim()) {
      return;
    }

    const song = search.trim();

    await searchVideo(song);

    const newHistory = [song, ...history.filter((item) => item !== song)];

    setHistory(newHistory);
    localStorage.setItem("searchHistory", JSON.stringify(newHistory));

    setSearch("");
  };

  const handleHistoryClick = (item) => {
    searchVideo(item);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("searchHistory");
  };

  return (
    <div style={styles.page}>
      {/* Audio element: eppovum render aagum, remount aagaadhu */}
      <audio
        ref={audioRef}
        preload="auto"
        onEnded={nextSong}
        onError={handleAudioError}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
      />

      <h1 style={styles.title}>🎵 My Music App</h1>

      <div style={styles.searchRow}>
        <input
          type="text"
          placeholder="Search song..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSearch();
            }
          }}
          style={styles.input}
        />

        <button
          onClick={handleSearch}
          disabled={loading}
          style={styles.searchBtn}
        >
          {loading ? "..." : "Search"}
        </button>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {currentSong && (
        <div style={{ marginTop: "18px" }}>
          <img
            src={`https://i.ytimg.com/vi/${currentSong.id}/hqdefault.jpg`}
            alt=""
            style={styles.thumb}
          />

          <h2 style={styles.songTitle}>{currentSong.title}</h2>

          {needsTap && (
            <button
              onClick={togglePlay}
              style={{ ...styles.ctrlBtn, width: "100%", marginBottom: "10px" }}
            >
              ▶ Tap to play
            </button>
          )}

          <input
            type="range"
            min="0"
            max={time.total || 0}
            step="1"
            value={time.current || 0}
            onChange={(e) => seek(e.target.value)}
            style={{ width: "100%" }}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "12px",
              color: "#555",
            }}
          >
            <span>{formatTime(time.current)}</span>
            <span>{formatTime(time.total)}</span>
          </div>

          <div style={styles.controls}>
            <button
              onClick={prevSong}
              disabled={currentIndex === 0}
              style={styles.ctrlBtn}
            >
              ⏮ Previous
            </button>

            <button onClick={togglePlay} style={styles.ctrlBtn}>
              {playing ? "⏸ Pause" : "▶ Play"}
            </button>

            <button
              onClick={nextSong}
              disabled={nextLoading}
              style={styles.ctrlBtn}
            >
              Next ⏭
            </button>
          </div>

          <div style={styles.status}>
            Song {currentIndex + 1}
            {audioLoading ? " • Audio load aagudhu..." : ""}
            {nextLoading ? " • Next song thedikitu irukken..." : ""}
          </div>

          <h3 style={styles.heading}>Played Songs</h3>

          <div style={styles.list}>
            {queue.map((v, i) => (
              <div
                key={v.id}
                onClick={() => setCurrentIndex(i)}
                style={{
                  padding: "12px",
                  marginBottom: "6px",
                  borderRadius: "8px",
                  fontSize: "14px",
                  background: i === currentIndex ? "#d6eaff" : "#f2f2f2",
                  fontWeight: i === currentIndex ? "bold" : "normal",
                }}
              >
                {i + 1}. {v.title}
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 style={styles.heading}>Search History</h3>

      {history.length === 0 ? (
        <p style={{ fontSize: "14px" }}>No search history</p>
      ) : (
        <div style={styles.chips}>
          {history.map((item, index) => (
            <div
              key={index}
              onClick={() => handleHistoryClick(item)}
              style={styles.chip}
            >
              {item}
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <button onClick={clearHistory} style={styles.clearBtn}>
          Clear History
        </button>
      )}

      {/* Mini bar (eppovum keezha) */}
      {currentSong && (
        <div style={styles.miniBar}>
          <img
            src={`https://i.ytimg.com/vi/${currentSong.id}/default.jpg`}
            alt=""
            style={styles.miniThumb}
          />

          <div style={styles.miniTitle}>{currentSong.title}</div>

          <button
            onClick={prevSong}
            disabled={currentIndex === 0}
            style={styles.miniBtn}
          >
            ⏮
          </button>

          <button onClick={togglePlay} style={styles.miniBtn}>
            {playing ? "⏸" : "▶"}
          </button>

          <button
            onClick={nextSong}
            disabled={nextLoading}
            style={styles.miniBtn}
          >
            {nextLoading ? "…" : "⏭"}
          </button>
        </div>
      )}
    </div>
  );
}

export default App;