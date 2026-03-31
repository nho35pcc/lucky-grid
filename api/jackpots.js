export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600'); // cache for 1 hour

  try {
    const [pb, mm] = await Promise.allSettled([
      fetchPowerball(),
      fetchMegaMillions(),
    ]);

    res.json({
      powerball:    pb.status === 'fulfilled' ? pb.value : null,
      megamillions: mm.status === 'fulfilled' ? mm.value : null,
    });
  } catch (e) {
    res.json({ powerball: null, megamillions: null });
  }
}

async function fetchPowerball() {
  const r = await fetch('https://www.powerball.com/api/v1/estimates/powerball', {
    headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
  });
  const d = await r.json();
  // Response has jackpotAmount or prize_amount
  const amt = d?.jackpotAmount || d?.prize_amount || d?.data?.jackpotAmount;
  if (amt) return formatAmount(amt);
  // Try array response
  if (Array.isArray(d) && d[0]) return formatAmount(d[0].jackpotAmount || d[0].prize_amount);
  throw new Error('No PB jackpot found');
}

async function fetchMegaMillions() {
  const r = await fetch('https://www.megamillions.com/api/v1/estimates/megamillions', {
    headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
  });
  const d = await r.json();
  const amt = d?.jackpotAmount || d?.prize_amount || d?.data?.jackpotAmount;
  if (amt) return formatAmount(amt);
  if (Array.isArray(d) && d[0]) return formatAmount(d[0].jackpotAmount || d[0].prize_amount);
  throw new Error('No MM jackpot found');
}

function formatAmount(raw) {
  // raw could be "123000000" or 123000000 or "$123 million"
  if (typeof raw === 'string' && raw.includes('$')) return raw;
  const n = Number(String(raw).replace(/[^0-9.]/g, ''));
  if (!n) throw new Error('Invalid amount');
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)} billion`;
  if (n >= 1_000_000)     return `$${Math.round(n / 1_000_000)} million`;
  return `$${n.toLocaleString()}`;
}
