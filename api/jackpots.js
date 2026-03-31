export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');
  try {
    const r = await fetch('https://api.apiverve.com/v1/lottery', {
      headers: {
        'x-api-key': process.env.APIVERVE_KEY,
        'Content-Type': 'application/json',
      }
    });
    const d = await r.json();
    console.log('APIVerve response:', JSON.stringify(d).slice(0, 600));
    const games = d?.data || d?.results || (Array.isArray(d) ? d : []);
    const find = (name) => games.find(g =>
      g?.name?.toLowerCase().includes(name) ||
      g?.game?.toLowerCase().includes(name) ||
      g?.lottery?.toLowerCase().includes(name)
    );
    const pb = find('powerball');
    const mm = find('mega');
    const jackpot = (g) => g?.jackpot || g?.jackpotAmount || g?.prize || g?.nextJackpot || g?.current_jackpot || null;
    res.json({
      powerball: jackpot(pb),
      megamillions: jackpot(mm),
    });
  } catch (e) {
    console.error('APIVerve error:', e.message);
    res.json({ powerball: null, megamillions: null });
  }
}
