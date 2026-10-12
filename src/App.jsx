import { useEffect, useRef, useState } from "react";
import "./App.css";

const GREEN = "#4cff6d";

const SERVERS = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yt.chocolatemoo53.com",
  "https://invidious.tiekoetter.com",
  "https://invidious.f5.si",
];

// Idhu irundha title-a skip pannum (song illa)
const BAD_WORDS = [
  "status", "whatsapp", "black screen", "jukebox", "mashup", "reels",
  "shorts", "karaoke", "reaction", "bgm", "ringtone", "trailer", "teaser",
  "dialogue", "8d", "slowed", "reverb", "lofi", "remix", "cover",
  "making", "promo", "first look", "glimpse", "full movie", "nonstop",
  "non stop", "collection", "top 10", "top 20", "scenes", "live stream",
  // News / non-music content
  "news", "live", "breaking", "headlines", "debate", "interview", "speech",
  "press meet", "podcast", "review", "explained", "episode", "election",
  "politics", "thanthi tv", "thalaimurai", "tv9", "ndtv", "cricket",
  "highlights", "motivation", "astrology", "rasi palan",
  // Compilations
  "hits", "best of", "playlist", "back to back",
];

// Whole-word match mattum (Discovery, Heartmaking maari words block aagaadhu)
const BAD_REGEX = new RegExp(
  `\\b(${BAD_WORDS.map((w) => w.replace(/\s+/g, "\\s+")).join("|")})\\b`,
  "i"
);

const STOP_WORDS = new Set([
  "official", "video", "videos", "lyrics", "lyric", "lyrical", "audio",
  "hd", "4k", "full", "song", "songs", "music", "movie", "film", "ft",
  "feat", "featuring", "tamil", "hindi", "telugu", "version", "the",
  "from", "new", "latest", "promo", "single",
]);

// "new" mattum recent songs-ku. (2k = 2000s era, adhu keezha ERA_REGEX-la)
const NEW_REGEX = /\b(new|latest|recent|2023|2024|2025|2026)\b/i;

// Era: 80s / 90s / 2k songs
const ERA_REGEX =
  /\b(80s|80's|1980s?|eighties|90s|90's|1990s?|nineties|2k|2000s|2000's|2010s|2010's)\b/i;

// Mood: sad / love / kuthu / happy
const MOODS = {
  sad: /\b(sad|soga|sogam|sokam|kanneer|feeling|feelings|heartbreak|breakup|melancholy|lonely|pain)\b/i,
  love: /\b(love|romantic|romance|kadhal|kaadhal|melody|melodies)\b/i,
  kuthu: /\b(kuthu|dance|mass|party|dappan)\b/i,
  happy: /\b(happy|fun|cheerful)\b/i,
};

// Oru mood search panna, idhu title-la irundha andha song vendaam
const MOOD_CONFLICTS = {
  sad: ["kuthu", "dance", "party", "dj", "dappan", "item song", "mass"],
  kuthu: ["sad", "soga", "sogam", "feeling", "heartbreak", "melancholy"],
};

function detectMood(query) {
  for (const [key, regex] of Object.entries(MOODS)) {
    if (regex.test(query)) return key;
  }
  return null;
}

const MAX_CONSECUTIVE_ERRORS = 5;

// Language: user select pannaama, search / first song-la irundhu thaaney kandupidikkum
const LANGUAGES = {
  tamil: { label: "Tamil", words: ["tamil"], script: /[\u0B80-\u0BFF]/ },
  hindi: { label: "Hindi", words: ["hindi", "bollywood"], script: /[\u0900-\u097F]/ },
  telugu: { label: "Telugu", words: ["telugu", "tollywood"], script: /[\u0C00-\u0C7F]/ },
  malayalam: { label: "Malayalam", words: ["malayalam", "mollywood"], script: /[\u0D00-\u0D7F]/ },
  kannada: { label: "Kannada", words: ["kannada", "sandalwood"], script: /[\u0C80-\u0CFF]/ },
  punjabi: { label: "Punjabi", words: ["punjabi"], script: /[\u0A00-\u0A7F]/ },
  english: { label: "English", words: ["english"], script: null },
};

function textOf(item) {
  return `${item.title} ${item.author || ""}`;
}

function hasWord(text, word) {
  return new RegExp(`\\b${word}\\b`, "i").test(text);
}

// Language-ku explicit-a match aagudha (word illana script)
function matchesLanguage(text, lang) {
  const info = LANGUAGES[lang];
  if (!info) return false;
  if (info.script && info.script.test(text)) return true;
  return info.words.some((w) => hasWord(text, w));
}

// Vera language nu theriyudha
function wrongLanguage(text, lang) {
  if (!LANGUAGES[lang]) return false;
  if (matchesLanguage(text, lang)) return false;

  for (const [key, info] of Object.entries(LANGUAGES)) {
    if (key === lang) continue;
    if (info.script && info.script.test(text)) return true;
    if (info.words.some((w) => hasWord(text, w))) return true;
  }
  return false;
}

// Search-la language word irundha adhu, illana default Tamil
function detectLanguage(text) {
  for (const key of Object.keys(LANGUAGES)) {
    if (matchesLanguage(text, key)) return key;
  }
  return "tamil";
}

let lastGoodServer = 0;

// Server fail aana next server try pannum
async function fetchJson(path) {
  for (let i = 0; i < SERVERS.length; i++) {
    const idx = (lastGoodServer + i) % SERVERS.length;
    const server = SERVERS[idx];

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);

      const response = await fetch(server + path, {
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) continue;

      const data = await response.json();
      lastGoodServer = idx;
      return data;
    } catch (err) {
      console.log("Server failed:", server);
    }
  }

  return null;
}

async function searchVideos(query, extra = "") {
  const data = await fetchJson(
    `/api/v1/search?q=${encodeURIComponent(query)}&type=video&region=IN${extra}`
  );

  if (!Array.isArray(data)) return [];

  return data.filter(
    (item) => item.type === "video" && item.videoId && item.title
  );
}

// Related videos (recommendedVideos) edukkum
async function getRelated(videoId) {
  const data = await fetchJson(`/api/v1/videos/${videoId}`);

  if (!data || !Array.isArray(data.recommendedVideos)) return [];

  return data.recommendedVideos.filter((item) => item.videoId && item.title);
}

// Idhu music category illa-nu YouTube sollura genres
const NON_MUSIC_GENRES = [
  "news", "sport", "gaming", "education", "science", "people", "howto",
  "nonprofit", "travel", "pets", "autos", "comedy",
];

const verifyCache = new Map();

// Video details-la genre paathu, news/live maari video-va reject pannum
async function verifyVideo(videoId) {
  if (verifyCache.has(videoId)) return verifyCache.get(videoId);

  const data = await fetchJson(`/api/v1/videos/${videoId}`);
  let ok = true; // servers fail aana block pannaama allow pannum

  if (data) {
    if (data.liveNow || data.isUpcoming) ok = false;

    const genre = (data.genre || "").toLowerCase();
    if (NON_MUSIC_GENRES.some((g) => genre.includes(g))) ok = false;
  }

  verifyCache.set(videoId, ok);
  return ok;
}

// List-la first verified video (max 4 check pannum, speed-kaaga)
async function firstVerified(list) {
  for (const item of list.slice(0, 4)) {
    if (await verifyVideo(item.videoId)) return item;
  }
  return null;
}

// "Annana Thaalaattum Video Song | Maaran" -> "Annana Thaalaattum"
function getSongName(title) {
  const first = title.split(/[|\-–—:]/)[0];
  return first.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
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

// Idhu nalla song-ah nu check
function isGood(item, playedNames, playedIds, lang, mood) {
  if (playedIds.has(item.videoId)) return false;

  if (
    item.lengthSeconds &&
    (item.lengthSeconds < 120 || item.lengthSeconds > 600)
  ) {
    return false;
  }

  // Title + channel name rendaiyum check pannum (e.g. "Sun News" channel)
  if (BAD_REGEX.test(textOf(item))) return false;

  if (wrongLanguage(textOf(item), lang)) return false;

  // Sad search-ku kuthu song vendaam (and vice versa)
  if (
    mood &&
    MOOD_CONFLICTS[mood] &&
    MOOD_CONFLICTS[mood].some((w) => hasWord(item.title, w))
  ) {
    return false;
  }

  const tokens = getTokens(getSongName(item.title));
  if (tokens.size === 0) return false;

  if (playedNames.some((t) => isSameSong(t, tokens))) return false;

  return true;
}

// ---------- Styles (Vibe Beatzz) ----------

const styles = {
  page: {
    padding: "20px",
    fontFamily: "Arial",
    color: "white",
    minHeight: "100vh",
  },
  title: {
    margin: "8px 0 20px 70px",
    fontSize: "24px",
    color: GREEN,
  },
  searchBox: {
    position: "absolute",
    left: "100px",
    top: "100px",
  },
  input: {
    padding: "12px",
    width: "500px",
    fontSize: "16px",
    borderRadius: "10px",
    border: "1px solid #c8c7b7",
    backgroundColor: "#eae9eb",
  },
  searchBtn: {
    padding: "12px",
    width: "50px",
    fontSize: "20px",
    borderRadius: "15px",
    border: "none",
    marginLeft: "10px",
    backgroundColor: GREEN,
    color: "black",
  },
  floatingError: {
    color: "red",
    position: "absolute",
    top: "155px",
    left: "100px",
  },
  historyToggle: {
    position: "absolute",
    left: "91%",
    top: "10%",
    zIndex: 10,
    border: "none",
    padding: "8px",
    borderRadius: "5px",
    backgroundColor: GREEN,
    cursor: "pointer",
    color: "#000",
  },
  historyPanel: {
    position: "absolute",
    left: "80%",
    top: "10%",
    marginTop: "40px",
    display: "flex",
    gap: "15px",
    alignItems: "stretch",
  },
  historyLine: {
    width: "2px",
    backgroundColor: "white",
    borderRadius: "10px",
    flexShrink: 0,
  },
  historyHeading: {
    color: GREEN,
    fontSize: "16px",
    marginBottom: "10px",
  },
  historyItem: {
    padding: "10px",
    marginBottom: "5px",
    background: "#eaf4ff",
    width: "250px",
    cursor: "pointer",
    borderRadius: "5px",
    position: "relative",
    color: "#000",
    fontSize: "12px",
    boxSizing: "border-box",
    paddingRight: "40px",
  },
  historyDelete: {
    border: "none",
    background: "none",
    cursor: "pointer",
    position: "absolute",
    right: "10px",
    top: "50%",
    transform: "translateY(-50%)",
    color: "red",
    fontSize: "16px",
  },
  clearBtn: {
    marginTop: "10px",
    padding: "5px",
    border: "none",
    backgroundColor: GREEN,
    borderRadius: "5px",
    cursor: "pointer",
    color: "#000",
  },
  playerBlock: {
    marginTop: "30px",
    position: "absolute",
    left: "100px",
    top: "130px",
    paddingBottom: "40px",
  },
  songTitle: {
    fontSize: "16px",
    marginBottom: "15px",
    color: "#fff",
    width: "800px",
  },
  playerBox: {
    width: "800px",
    height: "400px",
    border: "none",
    borderRadius: "10px",
    overflow: "hidden",
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: "15px",
    marginTop: "20px",
  },
  roundBtn: {
    backgroundColor: GREEN,
    borderRadius: "50%",
    height: "40px",
    width: "40px",
    border: "none",
    cursor: "pointer",
    color: "black",
    fontSize: "14px",
  },
  status: {
    fontSize: "13px",
    color: GREEN,
    marginTop: "12px",
  },
  playedHeading: {
    color: GREEN,
    fontSize: "16px",
    margin: "20px 0 10px",
  },
  playedList: {
    width: "800px",
    maxHeight: "200px",
    overflowY: "auto",
  },
};

function App() {
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState([]);
  const [queue, setQueue] = useState([]); // play aana songs
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [nextLoading, setNextLoading] = useState(false);
  const [error, setError] = useState("");
  const [modeInfo, setModeInfo] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const searchRef = useRef(null);
  const playerRef = useRef(null);
  const playerReadyRef = useRef(false);
  const containerRef = useRef(null);

  const queueRef = useRef([]);
  const indexRef = useRef(0);
  const wantsNewRef = useRef(false);
  const fetchingRef = useRef(false);
  const errorCountRef = useRef(0);

  // Search context: language, mood, era
  const languageRef = useRef("tamil");
  const moodRef = useRef(null);
  const contextRef = useRef(false); // true na era/mood search
  const queryRef = useRef("");

  // Render-ku munnaadi refs sync-la irukkum (nextSong/fetchNextSong update pannum)
  queueRef.current =
    queueRef.current.length === queue.length ? queueRef.current : queue;
  indexRef.current = currentIndex;

  // Load history + YouTube API
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

    if (!window.YT && !document.getElementById("youtube-iframe-api")) {
      const script = document.createElement("script");
      script.id = "youtube-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(script);
    }

    return () => {
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
        playerRef.current = null;
        playerReadyRef.current = false;
      }
    };
  }, []);

  // Next song-a thaney kandupidichu queue-la serkkum
  async function fetchNextSong() {
    if (fetchingRef.current) return null;
    fetchingRef.current = true;
    setNextLoading(true);

    try {
      const played = queueRef.current;
      const playedIds = new Set(played.map((v) => v.id));
      const playedNames = played.map((v) =>
        getTokens(getSongName(v.title))
      );

      // Ippo play aagura song (Previous click panna kuda correct-a irukkum)
      const current = played[indexRef.current] || played[played.length - 1];

      const lang = languageRef.current;
      const mood = moodRef.current;
      const check = (c) => isGood(c, playedNames, playedIds, lang, mood);
      const dateExtra = wantsNewRef.current ? "&date=year" : "";

      let pick = null;

      if (contextRef.current) {
        // ERA / MOOD MODE: "90s songs", "sad song" maari search-ku
        // original search-ye vechu thedum, so same era / same mood songs mattum varum.
        const base = queryRef.current;
        const artistPart = current
          ? current.title.split(/[|\-–—]/).slice(1).join(" ").trim()
          : "";

        const attempts = shuffle([1, 2, 3]).map((p) => ({ q: base, page: p }));
        if (artistPart) {
          attempts.push({ q: `${base} ${artistPart}`, page: 1 });
        }

        for (const a of attempts) {
          const results = await searchVideos(
            a.q,
            `${dateExtra}&page=${a.page}`
          );
          pick = await firstVerified(shuffle(results).filter(check));
          if (pick) break;
        }
      } else {
        // NORMAL MODE: specific song search-ku related songs
        // 1. Current song-oda related videos
        let candidates = current ? await getRelated(current.id) : [];

        // "new" search na, recent songs mattum
        if (wantsNewRef.current) {
          const twoYearsAgo = Date.now() - 730 * 24 * 60 * 60 * 1000;
          const recent = candidates.filter(
            (c) => !c.published || c.published * 1000 >= twoYearsAgo
          );
          if (recent.length > 0) candidates = recent;
        }

        const langLabel = LANGUAGES[lang] ? LANGUAGES[lang].label : "";
        const relatedGood = shuffle(candidates).filter(check);

        // Related-la language clear-a theriyura song irundha adhu
        pick = await firstVerified(
          relatedGood.filter((c) => matchesLanguage(textOf(c), lang))
        );

        // 2. Illana, language word-oda search (same movie/artist)
        if (!pick && current) {
          const artistPart = current.title.split(/[|\-–—]/).slice(1).join(" ");
          const base = (artistPart || current.title).trim();
          const q = langLabel ? `${base} ${langLabel} song` : base;

          const results = await searchVideos(q, dateExtra);

          const good = shuffle(results).filter(check);
          const ordered = [
            ...good.filter((c) => matchesLanguage(textOf(c), lang)),
            ...good.filter((c) => !matchesLanguage(textOf(c), lang)),
          ];
          pick = await firstVerified(ordered);
        }

        // 3. Last-ah, related-la vera language nu theriyaadha song
        if (!pick) pick = await firstVerified(relatedGood);
      }

      if (!pick) return null;

      const song = { id: pick.videoId, title: pick.title };

      // Ref-a udane update pannrom, appo dhaan nextSong() correct index paarkum
      queueRef.current = [...queueRef.current, song];
      setQueue(queueRef.current);

      return song;
    } finally {
      fetchingRef.current = false;
      setNextLoading(false);
    }
  }

  async function nextSong() {
    // Already fetch aagitu irundha, wait pannum (error kaatadhu)
    if (fetchingRef.current) return;

    // Queue-la already next song irundha adhu
    if (indexRef.current < queueRef.current.length - 1) {
      indexRef.current += 1;
      setCurrentIndex(indexRef.current);
      return;
    }

    // Illana pudhusa kandupidikkum
    const song = await fetchNextSong();

    if (song) {
      setError("");
      indexRef.current = queueRef.current.length - 1;
      setCurrentIndex(indexRef.current);
    } else {
      setError("Next song kedaikkala. Marubadi Next click pannunga.");
    }
  }

  function prevSong() {
    if (indexRef.current > 0) {
      indexRef.current -= 1;
      setCurrentIndex(indexRef.current);
    }
  }

  // Play / pause (green round button)
  const togglePlay = () => {
    const player = playerRef.current;

    if (!player || typeof player.playVideo !== "function") {
      setError("Player is loading. Please try again.");
      return;
    }

    setError("");

    if (isPlaying) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  };

  // Current song id mattum depend pannrom, so queue-la song add aanaalum current song restart aagaadhu
  const currentId = queue[currentIndex] ? queue[currentIndex].id : null;
  const hasQueue = queue.length > 0;

  // Play / change video
  useEffect(() => {
    if (!hasQueue) {
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
      }
      playerRef.current = null;
      playerReadyRef.current = false;
      setIsPlaying(false);
      return;
    }

    if (!currentId) return;

    const videoId = currentId;

    if (playerRef.current && playerReadyRef.current) {
      playerRef.current.loadVideoById({ videoId: videoId });
      return;
    }

    if (playerRef.current) {
      return;
    }

    let timer;

    function createPlayer() {
      if (!window.YT || !window.YT.Player) {
        timer = setTimeout(createPlayer, 500);
        return;
      }

      if (!containerRef.current) {
        return;
      }

      containerRef.current.innerHTML = "";
      const el = document.createElement("div");
      containerRef.current.appendChild(el);

      playerRef.current = new window.YT.Player(el, {
        width: "800",
        height: "400",
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            playerReadyRef.current = true;

            const latest = queueRef.current[indexRef.current];

            if (latest && latest.id !== videoId) {
              playerRef.current.loadVideoById({ videoId: latest.id });
            }
          },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              errorCountRef.current = 0;
              setIsPlaying(true);
            } else if (
              event.data === window.YT.PlayerState.PAUSED ||
              event.data === window.YT.PlayerState.ENDED
            ) {
              setIsPlaying(false);
            }

            if (event.data === window.YT.PlayerState.ENDED) {
              nextSong();
            }
          },
          // Video play aagala na (embed block) next song-ku poidum, aana 5 thadava mela poga maatten
          onError: () => {
            errorCountRef.current += 1;

            if (errorCountRef.current >= MAX_CONSECUTIVE_ERRORS) {
              setError(
                "Romba songs play aagala. Vera song search panni paarunga."
              );
              return;
            }

            nextSong();
          },
        },
      });
    }

    createPlayer();

    return () => {
      clearTimeout(timer);
    };
  }, [currentId, hasQueue]);

  const focusInput = () => {
    if (searchRef.current) searchRef.current.focus();
  };

  // Search
  const searchVideo = async (song) => {
    if (!song.trim()) {
      return;
    }

    setLoading(true);
    setError("");
    setQueue([]);
    setCurrentIndex(0);
    setIsPlaying(false);

    queueRef.current = [];
    indexRef.current = 0;
    errorCountRef.current = 0;

    const wantsNew = NEW_REGEX.test(song);
    wantsNewRef.current = wantsNew;

    // Search-la irundhu language, mood, era kandupidikkum
    const lang = detectLanguage(song);
    const mood = detectMood(song);
    const eraMatch = song.match(ERA_REGEX);
    const isContext = Boolean(eraMatch) || Boolean(mood);

    languageRef.current = lang;
    moodRef.current = mood;
    contextRef.current = isContext;

    setModeInfo(
      isContext
        ? [eraMatch ? eraMatch[0] : null, mood].filter(Boolean).join(" • ")
        : ""
    );

    // Era/mood search-na language word serthu search pannum (Tamil 90s songs)
    const langLabel = LANGUAGES[lang] ? LANGUAGES[lang].label : "";
    const query =
      isContext && langLabel && !hasWord(song, langLabel)
        ? `${song} ${langLabel}`
        : song;

    queryRef.current = query;

    let results = await searchVideos(query, wantsNew ? "&date=year" : "");

    if (results.length === 0 && wantsNew) {
      results = await searchVideos(query, "");
    }

    // Search panna song-ku first valid result
    const first =
      results.find((r) => isGood(r, [], new Set(), lang, mood)) || results[0];

    if (first) {
      // Normal search-la first song vera language-nu theriyudha, adhu language-a use pannum
      if (!isContext) {
        for (const key of Object.keys(LANGUAGES)) {
          if (matchesLanguage(textOf(first), key)) {
            languageRef.current = key;
            break;
          }
        }
      }

      const firstSong = { id: first.videoId, title: first.title };
      queueRef.current = [firstSong];
      setQueue([firstSong]);
    } else {
      setError("Song search failed. Try again.");
    }

    setLoading(false);
  };

  const handleSearch = async () => {
    if (!search.trim() || loading) {
      return;
    }

    const song = search.trim();

    const newHistory = [
      song,
      ...history.filter((item) => item !== song),
    ];

    setHistory(newHistory);
    localStorage.setItem("searchHistory", JSON.stringify(newHistory));

    setSearch("");
    await searchVideo(song);
  };

  const handleHistoryClick = (item) => {
    setSearch(item);
    searchVideo(item);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("searchHistory");
  };

  const clearSpecificHistoryItem = (item) => {
    const newHistory = history.filter((h) => h !== item);

    setHistory(newHistory);
    localStorage.setItem("searchHistory", JSON.stringify(newHistory));
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>🎧 Vibe Beatzz</h1>

      {/* Search */}
      <div style={styles.searchBox}>
        <input
          ref={searchRef}
          style={styles.input}
          type="text"
          placeholder="Search song... (90s songs, sad song)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch();
          }}
        />

        <button
          onClick={() => {
            if (!search.trim()) {
              focusInput();
            } else {
              handleSearch();
            }
          }}
          style={{ ...styles.searchBtn, cursor: loading ? "wait" : "pointer" }}
          disabled={loading}
          title="Search song"
        >
          {loading ? "⌛" : "⌕"}
        </button>
      </div>

      {/* Error (player illaadha bodhu) */}
      {error && queue.length === 0 && (
        <p style={styles.floatingError}>{error}</p>
      )}

      {/* View / Hide History */}
      <button
        onClick={() => setShowHistory((prev) => !prev)}
        style={styles.historyToggle}
      >
        {showHistory ? "Hide History" : "View History"}
      </button>

      {/* History */}
      {showHistory && (
        <div className="history" style={styles.historyPanel}>
          <div style={styles.historyLine} />

          <div>
            <h2 style={styles.historyHeading}>Search History</h2>

            {history.length === 0 ? (
              <p style={{ color: GREEN }}>No search history</p>
            ) : (
              history.map((item, index) => (
                <div
                  key={`${item}-${index}`}
                  onClick={() => handleHistoryClick(item)}
                  style={styles.historyItem}
                >
                  {item}

                  <button
                    style={styles.historyDelete}
                    title="Delete this history"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearSpecificHistoryItem(item);
                    }}
                  >
                    ✘
                  </button>
                </div>
              ))
            )}

            {history.length > 0 && (
              <button onClick={clearHistory} style={styles.clearBtn}>
                Clear History
              </button>
            )}
          </div>
        </div>
      )}

      {/* YouTube Player + queue */}
      {queue.length > 0 && queue[currentIndex] && (
        <div style={styles.playerBlock}>
          <h2 style={styles.songTitle}>{queue[currentIndex].title}</h2>

          <div ref={containerRef} id="ytplayer" style={styles.playerBox} />

          {/* Controls */}
          <div style={styles.controls}>
            <button
              onClick={prevSong}
              disabled={currentIndex === 0}
              style={{
                ...styles.roundBtn,
                opacity: currentIndex === 0 ? 0.4 : 1,
                cursor: currentIndex === 0 ? "not-allowed" : "pointer",
              }}
              title="Previous song"
            >
              ⏮
            </button>

            <button
              onClick={togglePlay}
              style={styles.roundBtn}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? "❚❚" : "▶"}
            </button>

            <button
              onClick={nextSong}
              disabled={nextLoading}
              style={{
                ...styles.roundBtn,
                opacity: nextLoading ? 0.4 : 1,
                cursor: nextLoading ? "wait" : "pointer",
              }}
              title="Next song"
            >
              {nextLoading ? "…" : "⏭"}
            </button>
          </div>

          <div style={styles.status}>
            Song {currentIndex + 1}
            {modeInfo ? ` • Mode: ${modeInfo}` : ""}
            {nextLoading ? " • Next song thedikitu irukken..." : ""}
          </div>

          {error && (
            <p style={{ color: "red", margin: "10px 0 0" }}>{error}</p>
          )}

          {/* Played songs */}
          <h3 style={styles.playedHeading}>Played Songs</h3>

          <div style={styles.playedList}>
            {queue.map((v, i) => (
              <div
                key={v.id}
                onClick={() => {
                  indexRef.current = i;
                  setCurrentIndex(i);
                }}
                style={{
                  padding: "10px",
                  marginBottom: "5px",
                  borderRadius: "5px",
                  cursor: "pointer",
                  fontSize: "12px",
                  boxSizing: "border-box",
                  color: "#000",
                  background: i === currentIndex ? GREEN : "#eaf4ff",
                  fontWeight: i === currentIndex ? "bold" : "normal",
                }}
              >
                {i + 1}. {v.title}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;