export default async function handler(req, res) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'tools-2024-04-04',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514', max_tokens: 300,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: 'Search for the current Powerball jackpot and Mega Millions jackpot today. Return ONLY JSON: {"powerball":"$XXX million","megamillions":"$XXX million"}' }],
    }),
  });
  const d = await r.json();
  const text = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const m = text.match(/\{[^}]+\}/);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(m ? JSON.parse(m[0]) : {});
}