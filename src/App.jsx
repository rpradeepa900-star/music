import { useEffect, useRef, useState } from "react";

const SERVERS = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yt.chocolatemoo53.com",
  "https://invidious.tiekoetter.com",
  "https://invidious.f5.si",
];

const BAD_WORDS = [
  "status", "whatsapp", "black screen", "jukebox", "mashup", "reels",
  "shorts", "karaoke", "reaction", "bgm", "ringtone", "trailer", "teaser",
  "dialogue", "8d", "slowed", "reverb", "lofi", "remix", "cover",
  "making", "promo", "first look", "glimpse", "full movie", "nonstop",
  "non stop", "collection", "top 10", "top 20", "scenes", "live stream",
  // Event / live videos
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

function getSongName(title) {
  const first = title.split(/[|\-–—:]/)[0];
  return first.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
}

// Title-la movie name guess pannum
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

const styles = {
  page: {
    maxWidth: "700px",
    margin: "0 auto",
    padding: "14px",
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
    cursor: "pointer",
  },
  heading: { fontSize: "18px", margin: "18px 0 8px" },
  chips: { display: "flex", flexWrap: "wrap", gap: "8px" },
  chip: {
    padding: "8px 14px",
    background: "#f2f2f2",
    borderRadius: "20px",
    fontSize: "14px",
    cursor: "pointer",
  },
  clearBtn: {
    marginTop: "10px",
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    background: "#fff",
    fontSize: "14px",
  },
  playerBox: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },
  tapOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.55)",
    zIndex: 5,
  },
  tapBtn: {
    padding: "14px 26px",
    fontSize: "18px",
    borderRadius: "30px",
    border: "none",
    background: "#fff",
    color: "#000",
  },
  controls: { display: "flex", gap: "10px", marginTop: "12px" },
  ctrlBtn: {
    flex: 1,
    minHeight: "50px",
    fontSize: "16px",
    borderRadius: "10px",
    border: "1px solid #ccc",
    background: "#f7f7f7",
  },
  songTitle: { fontSize: "17px", margin: "14px 0 10px", lineHeight: 1.3 },
  status: { fontSize: "14px", color: "#555", marginTop: "10px" },
  list: { maxHeight: "280px", overflowY: "auto" },
};

const miniBtn = {
  flex: 1,
  minHeight: "38px",
  fontSize: "18px",
  borderRadius: "8px",
  border: "none",
  background: "#2a2a2a",
  color: "#fff",
};

function App() {
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState([]);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [nextLoading, setNextLoading] = useState(false);
  const [error, setError] = useState("");
  const [needsTap, setNeedsTap] = useState(false);
  const [mini, setMini] = useState(false);

  const playerRef = useRef(null);
  const playerReadyRef = useRef(false);
  const containerRef = useRef(null);

  const queueRef = useRef([]);
  const indexRef = useRef(0);
  const wantsNewRef = useRef(false);
  const fetchingRef = useRef(false);
  const queryRef = useRef("");

  queueRef.current = queue;
  indexRef.current = currentIndex;

  // Load history + YouTube API
  useEffect(() => {
    const saved = localStorage.getItem("searchHistory");

    if (saved) {
      setHistory(JSON.parse(saved));
    }

    if (!window.YT) {
      const script = document.createElement("script");
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

  // Idhu nalla song-ah nu check
  function isGood(item, playedNames, playedIds, playedTitles = []) {
    if (playedIds.has(item.videoId)) return false;

    const title = item.title.toLowerCase();

    // Length 2 to 10 min mattum
    if (
      item.lengthSeconds &&
      (item.lengthSeconds < 120 || item.lengthSeconds > 600)
    ) {
      return false;
    }

    // Bad words (neenga search-la type panna word-a allow pannum)
    const queryLower = queryRef.current.toLowerCase();

    for (const { word, regex } of BAD_REGEXES) {
      if (regex.test(title) && !queryLower.includes(word)) {
        return false;
      }
    }

    const tokens = getTokens(getSongName(item.title));
    if (tokens.size === 0) return false;

    if (playedNames.some((t) => isSameSong(t, tokens))) return false;

    // Same movie-la irundhu already 1 song play aanaa skip
    const movieKey = getMovieKey(item.title);

    if (movieKey) {
      const sameMovieCount = playedTitles.filter(
        (t) => getMovieKey(t) === movieKey
      ).length;

      if (sameMovieCount >= 1) return false;
    }

    return true;
  }

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
      const playedTitles = played.map((v) => v.title);

      const current = played[played.length - 1];

      let candidates = current ? await getRelated(current.id) : [];

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

      if (!pick && current) {
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

      if (!pick) return null;

      const song = { id: pick.videoId, title: pick.title };

      queueRef.current = [...queueRef.current, song];
      setQueue(queueRef.current);

      return song;
    } finally {
      fetchingRef.current = false;
      setNextLoading(false);
    }
  }

  async function nextSong() {
    if (indexRef.current < queueRef.current.length - 1) {
      setCurrentIndex(indexRef.current + 1);
      return;
    }

    const song = await fetchNextSong();

    if (song) {
      setError("");
      setCurrentIndex(queueRef.current.length - 1);
    } else {
      setError("Next song kedaikkala. Marubadi Next click pannunga.");
    }
  }

  function prevSong() {
    if (indexRef.current > 0) {
      setCurrentIndex(indexRef.current - 1);
    }
  }

  function tapToPlay() {
    if (playerRef.current && playerRef.current.playVideo) {
      playerRef.current.playVideo();
    }
    setNeedsTap(false);
  }

  // Play / change video
  useEffect(() => {
    if (queue.length === 0) {
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
      }
      playerRef.current = null;
      playerReadyRef.current = false;
      return;
    }

    const current = queue[currentIndex];
    if (!current) return;

    const videoId = current.id;

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
        width: "100%",
        height: "100%",
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: (event) => {
            playerReadyRef.current = true;

            event.target.playVideo();

            const latest = queueRef.current[indexRef.current];

            if (latest && latest.id !== videoId) {
              playerRef.current.loadVideoById({ videoId: latest.id });
            }
          },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.ENDED) {
              nextSong();
            }
            if (event.data === window.YT.PlayerState.PLAYING) {
              setNeedsTap(false);
            }
          },
          onAutoplayBlocked: () => {
            setNeedsTap(true);
          },
          onError: () => {
            nextSong();
          },
        },
      });
    }

    createPlayer();

    return () => {
      clearTimeout(timer);
    };
  }, [queue, currentIndex]);

  // Lock screen / notification controls
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const current = queue[currentIndex];
    if (!current) return;

    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: current.title,
        artist: "My Music App",
        artwork: [
          {
            src: `https://i.ytimg.com/vi/${current.id}/hqdefault.jpg`,
            sizes: "480x360",
            type: "image/jpeg",
          },
        ],
      });

      navigator.mediaSession.setActionHandler("nexttrack", () => nextSong());
      navigator.mediaSession.setActionHandler("previoustrack", () =>
        prevSong()
      );
      navigator.mediaSession.setActionHandler("play", () => {
        if (playerRef.current) playerRef.current.playVideo();
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        if (playerRef.current) playerRef.current.pauseVideo();
      });
    } catch (err) {
      console.log("MediaSession not supported");
    }
  }, [queue, currentIndex]);

  const searchVideo = async (song) => {
    if (!song.trim()) {
      return;
    }

    setLoading(true);
    setError("");
    setQueue([]);
    setCurrentIndex(0);

    queueRef.current = [];
    indexRef.current = 0;
    queryRef.current = song;

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

    const newHistory = [
      song,
      ...history.filter((item) => item !== song),
    ];

    setHistory(newHistory);

    localStorage.setItem(
      "searchHistory",
      JSON.stringify(newHistory)
    );

    setSearch("");
  };

  const handleHistoryClick = (item) => {
    searchVideo(item);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("searchHistory");
  };

  // Mini popup styles
  const wrapStyle = mini
    ? {
        position: "fixed",
        top: "10px", // keezha venum na: bottom: "14px"
        right: "10px",
        width: "240px",
        zIndex: 1000,
        background: "#000",
        borderRadius: "12px",
        overflow: "hidden",
        boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
      }
    : {
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#000",
        borderRadius: "12px",
        overflow: "hidden",
      };

  const videoAreaStyle = mini
    ? { position: "relative", width: "100%", aspectRatio: "16 / 9" }
    : { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" };

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>🎵 My Music App</h1>

      {/* Search */}
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

      {/* Player */}
      {queue.length > 0 && queue[currentIndex] && (
        <div style={{ marginTop: "18px" }}>
          <div style={{ width: "100%", aspectRatio: "16 / 9" }}>
            <div style={wrapStyle}>
              <div style={videoAreaStyle}>
                <div ref={containerRef} style={styles.playerBox}></div>

                {needsTap && (
                  <div style={styles.tapOverlay}>
                    <button onClick={tapToPlay} style={styles.tapBtn}>
                      ▶ Tap to play
                    </button>
                  </div>
                )}

                {/* Normal mode-la mini button */}
                {!mini && (
                  <button
                    onClick={() => setMini(true)}
                    style={{
                      position: "absolute",
                      top: "6px",
                      left: "6px",
                      zIndex: 10,
                      padding: "4px 8px",
                      fontSize: "14px",
                      borderRadius: "6px",
                      border: "none",
                      background: "rgba(0,0,0,0.6)",
                      color: "#fff",
                    }}
                  >
                    🗗 Mini
                  </button>
                )}
              </div>

              {/* Mini mode-la song change controls */}
              {mini && (
                <div style={{ background: "#111", padding: "6px" }}>
                  <div
                    style={{
                      color: "#fff",
                      fontSize: "12px",
                      marginBottom: "6px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {queue[currentIndex].title}
                  </div>

                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      onClick={prevSong}
                      disabled={currentIndex === 0}
                      style={miniBtn}
                    >
                      ⏮
                    </button>

                    <button
                      onClick={nextSong}
                      disabled={nextLoading}
                      style={miniBtn}
                    >
                      {nextLoading ? "..." : "⏭"}
                    </button>

                    <button onClick={() => setMini(false)} style={miniBtn}>
                      ⤢
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <h2 style={styles.songTitle}>{queue[currentIndex].title}</h2>

          <div style={styles.controls}>
            <button
              onClick={prevSong}
              disabled={currentIndex === 0}
              style={styles.ctrlBtn}
            >
              ⏮ Previous
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
            {nextLoading ? " • Next song thedikitu irukken..." : ""}
          </div>

          {/* Played songs */}
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
                  cursor: "pointer",
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

      {/* History */}
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
    </div>
  );
}

export default App;