export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');

  const key = process.env.APIVERVE_KEY;
  const headers = { 'X-API-Key': key, 'Content-Type': 'application/json' };

  const [pb, mm] = await Promise.allSettled([
    fetch('https://api.apiverve.com/v1/lottery?numbers=powerball', { headers }).then(r => r.json()),
    fetch('https://api.apiverve.com/v1/lottery?numbers=megamillions', { headers }).then(r => r.json()),
  ]);

  function getJackpot(result) {
    if (result.status !== 'fulfilled') return null;
    const d = result.value?.data;
    if (!d) return null;
    return d.jackpot || d.jackpotAmount || d.prize || d.nextJackpot || null;
  }

  res.json({
    powerball: getJackpot(pb),
    megamillions: getJackpot(mm),
  });
}
