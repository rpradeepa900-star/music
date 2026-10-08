import { useEffect, useState } from "react";

function App() {
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState([]);
  const [videoId, setVideoId] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Multiple public Invidious servers
  const servers = [
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://yt.chocolatemoo53.com",
    "https://invidious.tiekoetter.com",
    "https://invidious.f5.si",
  ];

  // Load history
  useEffect(() => {
    const saved = localStorage.getItem("searchHistory");

    if (saved) {
      setHistory(JSON.parse(saved));
    }
  }, []);

  // Search YouTube through Invidious
  const searchVideo = async (song) => {
    if (!song.trim()) {
      return;
    }

    setLoading(true);
    setError("");
    setVideoId("");

    let found = false;

    // Try servers one by one
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
          setVideoId(video.videoId);
          setVideoTitle(video.title);

          found = true;
          break;
        }
      } catch (error) {
        console.log("Server failed:", server);
      }
    }

    if (!found) {
      setError(
        "Video search failed. Try another song or try again."
      );
    }

    setLoading(false);
  };

  // Search button
  const handleSearch = async () => {
    if (!search.trim()) {
      return;
    }

    const song = search.trim();

    // Search video
    await searchVideo(song);

    // Save history
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

  // History click
  const handleHistoryClick = (item) => {
    setSearch(item);
    searchVideo(item);
  };

  // Clear history
  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("searchHistory");
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
      <h1
        style={{
          fontSize: "clamp(24px, 5vw, 36px)",
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
          onChange={(e) => setSearch(e.target.value)}
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
            cursor: loading ? "not-allowed" : "pointer",
            border: "none",
            borderRadius: "5px",
            background: "#222",
            color: "white",
            fontSize: "16px",
            flex: "0 0 auto",
          }}
        >
          {loading ? "Searching..." : "Search"}
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
          fontSize: "clamp(20px, 4vw, 28px)",
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
              onClick={() => handleHistoryClick(item)}
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

      {/* Video */}
      {videoId && (
        <div
          style={{
            marginTop: "30px",
            width: "100%",
          }}
        >
          <h2
            style={{
              fontSize: "clamp(18px, 4vw, 26px)",
              wordBreak: "break-word",
            }}
          >
            {videoTitle}
          </h2>

          <div
            style={{
              position: "relative",
              width: "100%",
              paddingBottom: "56.25%",
              height: 0,
              overflow: "hidden",
              borderRadius: "10px",
            }}
          >
            <iframe
              src={`https://www.youtube.com/embed/${videoId}`}
              title={videoTitle}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                border: "none",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;