export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { v: videoId } = req.query;
  if (!videoId) {
    return res.status(400).json({ error: "Video ID required" });
  }

  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing SUPADATA_API_KEY" });
  }

  try {
    // Fetch transcript from Supadata
    const resp = await fetch(
      `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&text=true`,
      {
        headers: {
          "x-api-key": apiKey
        }
      }
    );

    if (!resp.ok) {
      throw new Error(`Supadata error: ${resp.status}`);
    }

    const data = await resp.json();
    const transcript = data.content || "";
    const hasTranscript = transcript.length > 50;

    // Fetch metadata via oEmbed (free, never blocked)
    let title = "YouTube Video";
    let channel = "Unknown Channel";
    try {
      const meta = await fetch(
        `https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${videoId}&format=json`
      );
      if (meta.ok) {
        const metaData = await meta.json();
        title = metaData.title || title;
        channel = metaData.author_name || channel;
      }
    } catch (_) { }

    return res.status(200).json({
      videoId,
      title,
      channel,
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      hasTranscript,
      transcript,
      segments: hasTranscript ? [{ start: 0, text: transcript }] : [],
      transcriptSource: hasTranscript ? "supadata" : "none",
      error: hasTranscript ? null : "No transcript available for this video."
    });

  } catch (err) {
    return res.status(200).json({
      videoId,
      title: "YouTube Video",
      channel: "Unknown Channel",
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      hasTranscript: false,
      transcript: "",
      segments: [],
      error: err.message
    });
  }
}