import { useEffect, useRef, useState } from "react";

function App() {
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState([]);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [videoId, setVideoId] = useState("");
  const [videoTitle, setVideoTitle] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const playerRef = useRef(null);
  const apiReadyRef = useRef(false);

  // Invidious servers
  const servers = [
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://yt.chocolatemoo53.com",
    "https://invidious.tiekoetter.com",
    "https://invidious.f5.si",
  ];

  // -----------------------------
  // Load YouTube API
  // -----------------------------
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      apiReadyRef.current = true;
      return;
    }

    const script = document.createElement("script");

    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;

    document.body.appendChild(script);

    window.onYouTubeIframeAPIReady = () => {
      apiReadyRef.current = true;
    };

    return () => {
      window.onYouTubeIframeAPIReady = null;
    };
  }, []);

  // -----------------------------
  // Load history
  // -----------------------------
  useEffect(() => {
    const saved = localStorage.getItem("searchHistory");

    if (saved) {
      setHistory(JSON.parse(saved));
    }
  }, []);

  // -----------------------------
  // Create YouTube player
  // -----------------------------
  useEffect(() => {
    if (!videoId) return;

    const createPlayer = () => {
      if (!window.YT || !window.YT.Player) {
        setTimeout(createPlayer, 500);
        return;
      }

      if (playerRef.current) {
        playerRef.current.destroy();
      }

      playerRef.current = new window.YT.Player("youtube-player", {
        videoId: videoId,

        playerVars: {
          autoplay: 1,
          controls: 1,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
        },

        events: {
          onReady: (event) => {
            event.target.playVideo();
          },

          onStateChange: (event) => {
            // Song ended
            if (
              event.data === window.YT.PlayerState.ENDED
            ) {
              playNextSong();
            }
          },

          onError: (event) => {
            console.log("YouTube error:", event.data);

            // If current song fails, try next
            playNextSong();
          },
        },
      });
    };

    createPlayer();

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [videoId]);

  // -----------------------------
  // Search YouTube
  // -----------------------------
  const searchVideo = async (song) => {
    if (!song.trim()) {
      return;
    }

    setLoading(true);
    setError("");

    let found = false;

    for (const server of servers) {
      try {
        const url =
          `${server}/api/v1/search` +
          `?q=${encodeURIComponent(song)}` +
          `&type=video`;

        const response = await fetch(url);

        if (!response.ok) {
          continue;
        }

        const data = await response.json();

        const video = data.find(
          (item) => item.type === "video"
        );

        if (video) {
          const newSong = {
            videoId: video.videoId,
            title: video.title,
          };

          // Add song to queue
          setQueue((oldQueue) => {
            const alreadyExists = oldQueue.some(
              (item) => item.videoId === newSong.videoId
            );

            if (alreadyExists) {
              return oldQueue;
            }

            return [...oldQueue, newSong];
          });

          // Play newly searched song
          setQueue((oldQueue) => {
            const alreadyExists = oldQueue.some(
              (item) => item.videoId === newSong.videoId
            );

            if (alreadyExists) {
              const index = oldQueue.findIndex(
                (item) => item.videoId === newSong.videoId
              );

              setCurrentIndex(index);

              setVideoId(newSong.videoId);
              setVideoTitle(newSong.title);

              return oldQueue;
            }

            const updatedQueue = [
              ...oldQueue,
              newSong,
            ];

            const newIndex = updatedQueue.length - 1;

            setCurrentIndex(newIndex);

            setVideoId(newSong.videoId);
            setVideoTitle(newSong.title);

            return updatedQueue;
          });

          found = true;
          break;
        }
      } catch (error) {
        console.log(
          "Server failed:",
          server
        );
      }
    }

    if (!found) {
      setError(
        "Video search failed. Try another song or try again."
      );
    }

    setLoading(false);
  };

  // -----------------------------
  // Search button
  // -----------------------------
  const handleSearch = async () => {
    if (!search.trim()) {
      return;
    }

    const song = search.trim();

    await searchVideo(song);

    const newHistory = [
      song,
      ...history.filter(
        (item) => item !== song
      ),
    ];

    setHistory(newHistory);

    localStorage.setItem(
      "searchHistory",
      JSON.stringify(newHistory)
    );

    setSearch("");
  };

  // -----------------------------
  // History click
  // -----------------------------
  const handleHistoryClick = (item) => {
    searchVideo(item);
  };

  // -----------------------------
  // Next song
  // -----------------------------
  const playNextSong = () => {
    setQueue((currentQueue) => {
      if (currentQueue.length === 0) {
        return currentQueue;
      }

      const nextIndex =
        currentIndex + 1;

      if (
        nextIndex >=
        currentQueue.length
      ) {
        // Queue finished
        return currentQueue;
      }

      const nextSong =
        currentQueue[nextIndex];

      setCurrentIndex(nextIndex);

      setVideoId(nextSong.videoId);
      setVideoTitle(nextSong.title);

      return currentQueue;
    });
  };

  // -----------------------------
  // Previous song
  // -----------------------------
  const playPreviousSong = () => {
    if (currentIndex <= 0) {
      return;
    }

    const previousIndex =
      currentIndex - 1;

    const previousSong =
      queue[previousIndex];

    setCurrentIndex(previousIndex);

    setVideoId(previousSong.videoId);
    setVideoTitle(previousSong.title);
  };

  // -----------------------------
  // Clear history
  // -----------------------------
  const clearHistory = () => {
    setHistory([]);

    localStorage.removeItem(
      "searchHistory"
    );
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "900px",
        margin: "40px auto",
        padding: "20px",
        boxSizing: "border-box",
        fontFamily: "Arial, sans-serif",
      }}
    >
      {/* Title */}

      <h1
        style={{
          fontSize:
            "clamp(24px, 5vw, 36px)",
          marginBottom: "25px",
        }}
      >
        🎵 My Music App
      </h1>

      {/* Search */}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          width: "100%",
        }}
      >
        <input
          type="text"
          placeholder="Search song..."
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSearch();
            }
          }}
          style={{
            padding: "12px",
            width: "300px",
            maxWidth: "100%",
            fontSize: "16px",
            boxSizing: "border-box",
            border: "1px solid #ccc",
            borderRadius: "5px",
            outline: "none",
            flex: "1 1 250px",
          }}
        />

        <button
          onClick={handleSearch}
          disabled={loading}
          style={{
            padding: "12px 20px",
            cursor: loading
              ? "not-allowed"
              : "pointer",
            border: "none",
            borderRadius: "5px",
            background: "#222",
            color: "white",
            fontSize: "16px",
          }}
        >
          {loading
            ? "Searching..."
            : "Search"}
        </button>
      </div>

      {/* Error */}

      {error && (
        <p
          style={{
            color: "red",
            marginTop: "15px",
          }}
        >
          {error}
        </p>
      )}

      {/* History */}

      <h2
        style={{
          marginTop: "30px",
          fontSize:
            "clamp(20px, 4vw, 28px)",
        }}
      >
        Search History
      </h2>

      {history.length === 0 ? (
        <p>No search history</p>
      ) : (
        <div style={{ width: "100%" }}>
          {history.map((item, index) => (
            <div
              key={index}
              onClick={() =>
                handleHistoryClick(item)
              }
              style={{
                padding: "12px",
                marginBottom: "8px",
                background: "#f2f2f2",
                width: "350px",
                maxWidth: "100%",
                boxSizing: "border-box",
                cursor: "pointer",
                borderRadius: "5px",
                wordBreak: "break-word",
              }}
            >
              🎵 {item}
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <button
          onClick={clearHistory}
          style={{
            marginTop: "10px",
            padding: "10px 15px",
            cursor: "pointer",
            border: "none",
            borderRadius: "5px",
            background: "#ddd",
          }}
        >
          Clear History
        </button>
      )}

      {/* Queue */}

      {queue.length > 0 && (
        <div
          style={{
            marginTop: "30px",
          }}
        >
          <h2>🎶 Queue</h2>

          {queue.map((song, index) => (
            <div
              key={song.videoId}
              onClick={() => {
                setCurrentIndex(index);
                setVideoId(song.videoId);
                setVideoTitle(song.title);
              }}
              style={{
                padding: "12px",
                marginBottom: "8px",
                borderRadius: "6px",
                background:
                  index === currentIndex
                    ? "#222"
                    : "#f2f2f2",
                color:
                  index === currentIndex
                    ? "white"
                    : "black",
                cursor: "pointer",
              }}
            >
              {index + 1}. {song.title}
            </div>
          ))}
        </div>
      )}

      {/* Player */}

      {videoId && (
        <div
          style={{
            marginTop: "30px",
            width: "100%",
          }}
        >
          <h2
            style={{
              fontSize:
                "clamp(18px, 4vw, 26px)",
              wordBreak: "break-word",
            }}
          >
            {videoTitle}
          </h2>

          {/* YouTube Player */}

          <div
            style={{
              position: "relative",
              width: "100%",
              paddingBottom: "56.25%",
              height: 0,
              overflow: "hidden",
              borderRadius: "10px",
              background: "#000",
            }}
          >
            <div
              id="youtube-player"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
              }}
            />
          </div>

          {/* Controls */}

          <div
            style={{
              display: "flex",
              gap: "10px",
              marginTop: "15px",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={playPreviousSong}
              disabled={currentIndex === 0}
              style={{
                padding: "12px 18px",
                border: "none",
                borderRadius: "6px",
                cursor:
                  currentIndex === 0
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              ⏮ Previous
            </button>

            <button
              onClick={() => {
                if (playerRef.current) {
                  playerRef.current.playVideo();
                }
              }}
              style={{
                padding: "12px 18px",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                background: "#222",
                color: "white",
              }}
            >
              ▶ Play
            </button>

            <button
              onClick={() => {
                if (playerRef.current) {
                  playerRef.current.pauseVideo();
                }
              }}
              style={{
                padding: "12px 18px",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              ⏸ Pause
            </button>

            <button
              onClick={playNextSong}
              disabled={
                currentIndex >=
                queue.length - 1
              }
              style={{
                padding: "12px 18px",
                border: "none",
                borderRadius: "6px",
                cursor:
                  currentIndex >=
                  queue.length - 1
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              Next ⏭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;