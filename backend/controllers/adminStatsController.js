import User    from "../models/User.js";
import Law     from "../models/Law.js";
import Judgement from "../models/Judgement.js";
import Message from "../models/message.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function lastNMonths(n) {
  const months = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: d.toLocaleString("en-US", { month: "short" }),
      start: new Date(d.getFullYear(), d.getMonth(), 1),
      end:   new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
    });
  }
  return months;
}

function buildLast30Days() {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const label = d.toLocaleString("en-US", { month: "short", day: "numeric" });
    days.push({ key, label });
  }
  return days;
}

function isWithinLast30Days(date) {
  if (!date) return true; // no data → default to daily (empty chart)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  cutoff.setHours(0, 0, 0, 0);
  return new Date(date) >= cutoff;
}

// ── Search volume builders ────────────────────────────────────────────────────

async function searchVolumeDaily() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const raw = await Message.aggregate([
    { $match: { role: "assistant", timestamp: { $gte: thirtyDaysAgo } } },
    {
      $group: {
        _id: {
          year:  { $year:  "$timestamp" },
          month: { $month: "$timestamp" },
          day:   { $dayOfMonth: "$timestamp" },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
  ]);

  const map = new Map(
    raw.map((d) => [
      `${d._id.year}-${String(d._id.month).padStart(2, "0")}-${String(d._id.day).padStart(2, "0")}`,
      d.count,
    ])
  );

  return buildLast30Days().map(({ key, label }) => ({
    label,
    searches: map.get(key) ?? 0,
  }));
}

async function searchVolumeMonthly() {
  const periods = lastNMonths(6);
  return Promise.all(
    periods.map(async (p) => ({
      label:    p.label,
      searches: await Message.countDocuments({
        role:      "assistant",
        timestamp: { $gte: p.start, $lte: p.end },
      }),
    }))
  );
}

// ── Response time builders / Getter ────────────────────────────────────────────────────

async function responseTimeRaw(since) {
  const messages = await Message.find(
    {
      role:         "assistant",
      responseTime: { $exists: true, $gt: 0 },
      timestamp:    { $gte: since },
    },
    { responseTime: 1, timestamp: 1, _id: 0 }
  ).sort({ timestamp: 1 });

  return messages.map((m) => ({
    // numeric ms-since-epoch so Recharts ScatterChart can place it on a continuous axis
    ts:           new Date(m.timestamp).getTime(),
    // human-readable label for the tooltip
    label:        new Date(m.timestamp).toLocaleString("en-US", {
                    month: "short", day: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  }),
    responseTime: +(m.responseTime / 1000).toFixed(2), // seconds
  }));
}


// ── GET /admin/stats ──────────────────────────────────────────────────────────

export const getStats = async (req, res) => {
  try {
    // ── Totals ────────────────────────────────────────────────────────────────
    const [totalUsers, totalLaws, totalCases, totalSearches] = await Promise.all([
      User.countDocuments(),
      Law.countDocuments(),
      Judgement.countDocuments(),
      Message.countDocuments({ role: "assistant" }),
    ]);

    

    // ── MoM growth ────────────────────────────────────────────────────────────
    const now            = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [usersThisMonth, usersLastMonth, searchesThisMonth, searchesLastMonth] =
      await Promise.all([
        User.countDocuments({ createdAt: { $gte: thisMonthStart } }),
        User.countDocuments({ createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd } }),
        Message.countDocuments({ role: "assistant", timestamp: { $gte: thisMonthStart } }),
        Message.countDocuments({ role: "assistant", timestamp: { $gte: lastMonthStart, $lte: lastMonthEnd } }),
      ]);

    const pct = (cur, prev) =>
      prev === 0 ? null : +(((cur - prev) / prev) * 100).toFixed(1);

    // ── All-time avg response ─────────────────────────────────────────────────
    const responseAgg = await Message.aggregate([
      { $match: { role: "assistant", responseTime: { $exists: true, $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: "$responseTime" } } },
    ]);
    const avgResponseSec = +((responseAgg[0]?.avg ?? 0) / 1000).toFixed(1);

    // // ── Oldest assistant message → decide granularity for BOTH charts ─────────
    const oldestMessage = await Message.findOne(
      { role: "assistant" },
      { timestamp: 1 }
    ).sort({ timestamp: 1 });

    // ── Build chart data ──────────────────────────────────────────────────────
    // const [searchVolume, responseTimeChart] = await Promise.all([
    //   useDailyCharts ? searchVolumeDaily()   : searchVolumeMonthly(),
    //   useDailyCharts ? responseTimeDaily()   : responseTimeMonthly(),
    // ]);

    const useDailyCharts = isWithinLast30Days(oldestMessage?.timestamp);

    // In getStats, replace the two responseTime calls:
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [searchVolume, responseTimeChart] = await Promise.all([
    useDailyCharts ? searchVolumeDaily()              : searchVolumeMonthly(),
    responseTimeRaw(useDailyCharts ? thirtyDaysAgo : sixMonthsAgo), // ← same for both modes
    ]);

    
    res.json({
      // Stat cards
      totalUsers,
      totalLaws,
      totalCases,
      totalSearches,
      avgResponseSec,
      userGrowthPct:   pct(usersThisMonth,    usersLastMonth),
      searchGrowthPct: pct(searchesThisMonth, searchesLastMonth),

      // Charts — both use the same granularity mode
      chartMode:         useDailyCharts ? "daily" : "monthly", // tells frontend which labels to show
      searchVolume,      // [{ label, searches }]
      responseTimeChart, // [{ label, responseTime }]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};