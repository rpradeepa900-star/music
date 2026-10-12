import { useEffect, useState, useRef } from "react";
import "./App.css";

function App() {
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState([]);
  const [videoId, setVideoId] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const searchRef = useRef(null);
  const playerRef = useRef(null);
  const playerContainerRef = useRef(null);

  // Next song queue
  const queueRef = useRef([]);
  const currentIndexRef = useRef(0);
  const autoplayNextRef = useRef(false);

  const servers = [
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://yt.chocolatemoo53.com",
    "https://invidious.tiekoetter.com",
    "https://invidious.f5.si",
  ];

  // Load saved history
  useEffect(() => {
    try {
      const saved = localStorage.getItem("searchHistory");

      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (err) {
      console.error("Failed to load history:", err);
    }
  }, []);

  // Load YouTube API
  useEffect(() => {
    if (window.YT && window.YT.Player) return;

    if (!document.getElementById("youtube-iframe-api")) {
      const script = document.createElement("script");

      script.id = "youtube-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";

      document.body.appendChild(script);
    }
  }, []);

  // Create YouTube player
  useEffect(() => {
    if (!videoId || !playerContainerRef.current) return;

    let cancelled = false;

    const createPlayer = () => {
      if (cancelled || !playerContainerRef.current) return;

      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }

      // Next song mudinja udane autoplay enable aagum
      const shouldAutoplay = autoplayNextRef.current;
      autoplayNextRef.current = false;

      playerRef.current = new window.YT.Player(
        playerContainerRef.current,
        {
          width: "800",
          height: "380",
          videoId: videoId,

          playerVars: {
            autoplay: shouldAutoplay ? 1 : 0,
            playsinline: 1,
          },

          events: {
            onReady: () => {
              if (!cancelled) {
                setIsPlaying(false);
              }
            },

            onStateChange: (event) => {
              if (cancelled) return;

              // Song playing
              if (
                event.data === window.YT.PlayerState.PLAYING
              ) {
                setIsPlaying(true);
                setError("");
              }

              // Song paused
              else if (
                event.data === window.YT.PlayerState.PAUSED
              ) {
                setIsPlaying(false);
              }

              // Song finished - play next song
              else if (
                event.data === window.YT.PlayerState.ENDED
              ) {
                setIsPlaying(false);

                const nextIndex =
                  currentIndexRef.current + 1;

                if (nextIndex < queueRef.current.length) {
                  const nextVideo =
                    queueRef.current[nextIndex];

                  currentIndexRef.current = nextIndex;

                  // Enable autoplay for next song
                  autoplayNextRef.current = true;

                  setError("");
                  setVideoTitle(nextVideo.title);
                  setVideoId(nextVideo.videoId);
                } else {
                  setError(
                    "Songs mudinjiduchu! Next songs-ku search pannunga."
                  );
                }
              }
            },

            onError: () => {
              if (!cancelled) {
                setIsPlaying(false);
                setError(
                  "This video cannot be played. Try another song."
                );
              }
            },
          },
        }
      );
    };

    if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
      const previousCallback =
        window.onYouTubeIframeAPIReady;

      window.onYouTubeIframeAPIReady = () => {
        if (typeof previousCallback === "function") {
          previousCallback();
        }

        createPlayer();
      };
    }

    return () => {
      cancelled = true;

      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [videoId]);

  const focusInput = () => {
    searchRef.current?.focus();
  };

  // Search songs and prepare the next-song queue
  const searchVideo = async (song) => {
    if (!song.trim()) return;

    setLoading(true);
    setError("");
    setIsPlaying(false);

    let foundVideos = [];

    try {
      for (const server of servers) {
        try {
          const url =
            `${server}/api/v1/search?q=${encodeURIComponent(song)}` +
            "&type=video";

          const response = await fetch(url);

          if (!response.ok) continue;

          const data = await response.json();

          if (!Array.isArray(data)) continue;

          // Get multiple different video results
          foundVideos = data
            .filter(
              (item) =>
                item.type === "video" &&
                item.videoId &&
                item.title
            )
            .filter(
              (item, index, array) =>
                array.findIndex(
                  (video) => video.videoId === item.videoId
                ) === index
            )
            .slice(0, 10);

          if (foundVideos.length > 0) break;
        } catch (err) {
          console.log("Server failed:", server);
        }
      }

      if (foundVideos.length > 0) {
        // Save search results for autoplay
        queueRef.current = foundVideos;
        currentIndexRef.current = 0;
        autoplayNextRef.current = false;

        const firstVideo = foundVideos[0];

        setVideoTitle(firstVideo.title);

        if (
          firstVideo.videoId === videoId &&
          playerRef.current
        ) {
          playerRef.current.loadVideoById(
            firstVideo.videoId
          );
        } else {
          setVideoId(firstVideo.videoId);
        }
      } else {
        queueRef.current = [];

        setError(
          "Video search failed. Try another song or try again."
        );
      }
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!search.trim() || loading) return;

    const song = search.trim();

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
    const newHistory = history.filter(
      (historyItem) => historyItem !== item
    );

    setHistory(newHistory);

    localStorage.setItem(
      "searchHistory",
      JSON.stringify(newHistory)
    );
  };

  // Play / Pause
  const play = () => {
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

  const playerButtonStyle = {
    backgroundColor: "#4cff6d",
    borderRadius: "50%",
    height: "40px",
    width: "40px",
    border: "none",
    cursor: "pointer",
    margin: "5px 0 30px 0",
    position: "relative",
    top: "30px",
    right: "430px",
    color: "black",
  };

  const inputStyle = {
    padding: "12px",
    width: "500px",
    fontSize: "16px",
    borderRadius: "10px",
    border: "1px solid #c8c7b7",
    backgroundColor: "#eae9eb",
  };

  const searchButtonStyle = {
    padding: "12px",
    width: "50px",
    fontSize: "20px",
    borderRadius: "15px",
    border: "none",
    marginLeft: "10px",
    cursor: loading ? "wait" : "pointer",
    backgroundColor: "#4cff6d",
    color: "black",
  };

  return (
    <div
      style={{
        padding: "20px",
        fontFamily: "Arial",
        color: "white",
        minHeight: "100vh",
      }}
    >
      <h1
        style={{
          margin: "8px 0 20px 70px",
          fontSize: "24px",
          color: "#4cff6d",
        }}
      >
        🎧 Vibe Beatzz
      </h1>

      {/* Search */}
      <div
        style={{
          position: "absolute",
          left: "100px",
          top: "100px",
        }}
      >
        <input
          ref={searchRef}
          style={inputStyle}
          type="text"
          placeholder="Search song..."
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
          style={searchButtonStyle}
          disabled={loading}
          title="Search song"
        >
          {loading ? "⌛" : "⌕"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <p
          style={{
            color: "red",
            position: "absolute",
            top: "155px",
            left: "100px",
          }}
        >
          {error}
        </p>
      )}

      {/* View / Hide History */}
      <button
        onClick={() => setShowHistory((prev) => !prev)}
        style={{
          position: "absolute",
          left: "91%",
          top: "10%",
          zIndex: 10,
          border: "none",
          padding: "8px",
          borderRadius: "5px",
          backgroundColor: "#4cff6d",
          cursor: "pointer",
          color: "#000",
        }}
      >
        {showHistory ? "Hide History" : "View History"}
      </button>

      {/* History */}
      {showHistory && (
        <div
          className="history"
          style={{
            position: "absolute",
            left: "80%",
            top: "10%",
            display: "flex",
            gap: "15px",
            alignItems: "stretch",
          }}
        >
          <div
            style={{
              width: "2px",
              backgroundColor: "white",
              borderRadius: "10px",
              flexShrink: 0,
            }}
          />

          <div>
            <h2
              style={{
                color: "#4cff6d",
                fontSize: "16px",
                marginBottom: "10px",
              }}
            >
              Search History
            </h2>

            {history.length === 0 ? (
              <p style={{ color: "#4cff6d" }}>
                No search history
              </p>
            ) : (
              history.map((item, index) => (
                <div
                  key={`${item}-${index}`}
                  onClick={() => handleHistoryClick(item)}
                  style={{
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
                  }}
                >
                  {item}

                  <button
                    style={{
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      position: "absolute",
                      right: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "red",
                      fontSize: "16px",
                    }}
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
              <button
                onClick={clearHistory}
                style={{
                  marginTop: "10px",
                  padding: "5px",
                  border: "none",
                  backgroundColor: "#4cff6d",
                  borderRadius: "5px",
                  cursor: "pointer",
                  color: "#000",
                }}
              >
                Clear History
              </button>
            )}
          </div>
        </div>
      )}

      {/* YouTube Player */}
      {videoId && (
        <div
          style={{
            marginTop: "30px",
            position: "absolute",
            left: "100px",
            top: "130px",
          }}
        >
          <h2
            style={{
              fontSize: "16px",
              marginBottom: "15px",
              color: "#fff",
            }}
          >
            {videoTitle}
          </h2>

          <div
            key={videoId}
            ref={playerContainerRef}
            id="ytplayer"
            style={{
              width: "800px",
              height: "400px",
              border: "none",
              borderRadius: "10px",
              overflow: "hidden",
            }}
          />

          <button
            style={playerButtonStyle}
            onClick={play}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "❚❚" : "▶"}
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
