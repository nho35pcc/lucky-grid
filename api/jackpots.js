export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: 'Search for the current Powerball jackpot amount and Mega Millions jackpot amount today. Return ONLY this JSON and nothing else: {"powerball":"$XXX million","megamillions":"$XXX million"}'
        }],
      }),
    });
    const d = await r.json();
    const text = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const m = text.match(/\{[^}]+\}/);
    res.json(m ? JSON.parse(m[0]) : {});
  } catch (e) {
    res.json({});
  }
}
