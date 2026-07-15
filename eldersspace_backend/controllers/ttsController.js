// Proxies Google Cloud Text-to-Speech so the API key stays server-side
// instead of being shipped inside the Flutter client bundle.
exports.synthesize = async (req, res) => {
  const { text, voiceName, speakingRate } = req.body;

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'TTS is not configured' });
  }

  try {
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: 'th-TH', name: voiceName || 'th-TH-Standard-A' },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: typeof speakingRate === 'number' ? speakingRate : 1.0,
          },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'TTS request failed' });
    }

    return res.json({ audioContent: data.audioContent });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
