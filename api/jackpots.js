export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: 'Search for the current Powerball jackpot amount and Mega Millions jackpot amount today. Return ONLY this exact JSON format and nothing else: {"powerball":"$XXX million","megamillions":"$XXX million"}'
        }],
      }),
    });
    const d = await r.json();
    console.log('API response:', JSON.stringify(d).slice(0, 500));
    const text = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const m = text.match(/\{[^}]+\}/);
    if (m) {
      res.json(JSON.parse(m[0]));
    } else {
      // Fallback: try parsing any dollar amounts from text
      const pb = text.match(/Powerball[^$]*\$([0-9,.]+\s*(?:million|billion))/i);
      const mm = text.match(/Mega Millions[^$]*\$([0-9,.]+\s*(?:million|billion))/i);
      res.json({
        powerball: pb ? '$' + pb[1] : null,
        megamillions: mm ? '$' + mm[1] : null,
      });
    }
  } catch (e) {
    console.error('Jackpots error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
