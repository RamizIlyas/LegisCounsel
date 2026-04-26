import { useEffect, useState } from "react";
import { DashboardLayout } from "./DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Users,
  Search,
  TrendingUp,
  TrendingDown,
  Database,
  Activity,
  BarChart3,
  AlertCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Line,
  Scatter,
  ZAxis,
} from "recharts";
import { adminApi } from "../services/AdminApi";
import type { Page } from "../App";

// ── Types ─────────────────────────────────────────────────────────────────────

// interface ChartPoint {
//   label: string;
//   searches?: number;
//   responseTime?: number;
// }
interface ResponseTimePoint {
  ts: number; // epoch ms — used as x value
  label: string; // "Apr 24, 02:15 PM" — used in tooltip
  responseTime: number; // seconds
}

interface StatsData {
  totalUsers: number;
  totalLaws: number;
  totalCases: number;
  totalSearches: number;
  avgResponseSec: number;
  userGrowthPct: number | null;
  searchGrowthPct: number | null;
  chartMode: "daily" | "monthly"; // ← drives axis labels + descriptions
  searchVolume: { label: string; searches: number }[];
  responseTimeChart: ResponseTimePoint[];
}

interface AdminPanelProps {
  onNavigate: (page: Page) => void;
  onLogout: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function GrowthBadge({ pct }: { pct: number | null }) {
  if (pct === null)
    return <span className="text-sm text-gray-400">No prior data</span>;

  const positive = pct >= 0;
  return (
    <div
      className={`flex items-center gap-1 text-sm font-medium ${positive ? "text-green-600" : "text-red-500"}`}
    >
      {positive ? (
        <TrendingUp className="h-4 w-4" />
      ) : (
        <TrendingDown className="h-4 w-4" />
      )}
      <span>
        {positive ? "+" : ""}
        {pct}% from last month
      </span>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  valueColor,
  footer,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  valueColor: string;
  footer: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Icon className="h-4 w-4" />
          {label}
        </div>
        <div className={`${valueColor} text-3xl font-bold`}>{value}</div>
      </CardHeader>
      <CardContent>{footer}</CardContent>
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
        <div className="h-9 w-24 bg-gray-200 rounded animate-pulse mt-2" />
      </CardHeader>
      <CardContent>
        <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
      </CardContent>
    </Card>
  );
}

function SkeletonChart() {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-40 bg-gray-200 rounded animate-pulse" />
        <div className="h-4 w-56 bg-gray-100 rounded animate-pulse mt-2" />
      </CardHeader>
      <CardContent>
        <div className="h-[250px] bg-gray-100 rounded-lg animate-pulse" />
      </CardContent>
    </Card>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-[250px] flex flex-col items-center justify-center text-gray-400 gap-2">
      <BarChart3 className="h-8 w-8 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// 3. Custom tooltip for the scatter chart — add outside AdminPanel
function ResponseTimeTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: ResponseTimePoint = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm text-sm">
      <p className="text-gray-500">{d.label}</p>
      <p className="font-semibold text-[#D4AF37]">{d.responseTime}s</p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AdminPanel({ onNavigate, onLogout }: AdminPanelProps) {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await adminApi.getStats();
        if (!cancelled) setStats(data);
      } catch (err : any) {
        if (!cancelled) setError(err.message || "Failed to load stats");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchStats();
    // This live-updates every 60s — in a real app, consider WebSockets for efficiency
    const interval = setInterval(fetchStats, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Derived from chartMode — keeps JSX clean
  const isDaily = stats?.chartMode === "daily";
  const xAxisInterval = isDaily ? 4 : 0; // daily: every 5th label; monthly: all 6
  const searchDesc = isDaily
    ? "Daily search activity — last 30 days"
    : "Monthly search activity — last 6 months";
  const responseDesc = isDaily
    ? "Mean response time (seconds) — last 30 days"
    : "Mean response time (seconds) — last 6 months";

  return (
    <DashboardLayout
      userRole="admin"
      currentPage="admin"
      onNavigate={onNavigate}
      onLogout={onLogout}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[#1E293B] mb-2">Admin Dashboard</h1>
            <p className="text-gray-600">System overview and user management</p>
          </div>

          {!loading && !error && (
            <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              Live · refreshes every 60s
            </div>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="ml-auto text-xs underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {loading || !stats ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <StatCard
                icon={Users}
                label="Total Users"
                value={formatCount(stats.totalUsers)}
                valueColor="text-[#1E3A8A]"
                footer={<GrowthBadge pct={stats.userGrowthPct} />}
              />
              <StatCard
                icon={Search}
                label="Active Searches"
                value={formatCount(stats.totalSearches)}
                valueColor="text-[#D4AF37]"
                footer={<GrowthBadge pct={stats.searchGrowthPct} />}
              />
              <StatCard
                icon={Activity}
                label="Mean Model Response Time"
                value={`${stats.avgResponseSec}s`}
                valueColor="text-[#1E3A8A]"
                footer={
                  <span className="text-sm text-gray-500">
                    Across all conversations
                  </span>
                }
              />
              <StatCard
                icon={Database}
                label="Laws Count"
                value={formatCount(stats.totalLaws)}
                valueColor="text-[#D4AF37]"
                footer={
                  <span className="text-sm text-gray-500">Updated daily</span>
                }
              />
              <StatCard
                icon={Database}
                label="Judgements Count"
                value={formatCount(stats.totalCases)}
                valueColor="text-[#D4AF37]"
                footer={
                  <span className="text-sm text-gray-500">Updated daily</span>
                }
              />
            </>
          )}
        </div>

        {/* Charts */}
        <div className="grid lg:grid-cols-2 gap-6">
          {loading || !stats ? (
            <>
              <SkeletonChart />
              <SkeletonChart />
            </>
          ) : (
            <>
              {/* Search Volume */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-[#1E293B] flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-[#1E3A8A]" />
                    Search Volume
                  </CardTitle>
                  <CardDescription>{searchDesc}</CardDescription>
                </CardHeader>
                <CardContent>
                  {stats.searchVolume.every((d) => d.searches === 0) ? (
                    <EmptyChart message="No search data yet" />
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={stats.searchVolume}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis
                          dataKey="label"
                          stroke="#6b7280"
                          tick={{ fontSize: 11 }}
                          interval={xAxisInterval}
                        />
                        <YAxis stroke="#6b7280" allowDecimals={false} />
                        <Tooltip
                          contentStyle={{
                            background: "white",
                            border: "1px solid #e5e7eb",
                            borderRadius: "8px",
                          }}
                          formatter={(v: number) => [v, "Searches"]}
                          labelFormatter={(l) =>
                            isDaily ? `Date: ${l}` : `Month: ${l}`
                          }
                        />
                        <Bar
                          dataKey="searches"
                          fill="#1E3A8A"
                          radius={[8, 8, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Response Time */}
              {/* <Card>
                <CardHeader>
                  <CardTitle className="text-[#1E293B] flex items-center gap-2">
                    <Activity className="h-5 w-5 text-[#D4AF37]" />
                    AI Response Time
                  </CardTitle>
                  <CardDescription>{responseDesc}</CardDescription>
                </CardHeader>
                <CardContent>
                  {stats.responseTimeChart.every((d) => d.responseTime === 0) ? (
                    <EmptyChart message="No response time data yet" />
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <ScatterChart data={stats.responseTimeChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis
                          dataKey="label"
                          stroke="#6b7280"
                          tick={{ fontSize: 11 }}
                          interval={xAxisInterval}
                        />
                        <YAxis stroke="#6b7280" tickFormatter={(v) => `${v}s`} />
                        <Tooltip
                          contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "8px" }}
                          formatter={(v: number) => [`${v}s`, "Avg Response"]}
                          labelFormatter={(l) => (isDaily ? `Date: ${l}` : `Month: ${l}`)}
                        />
                        <Line
                          type="monotone"
                          dataKey="responseTime"
                          stroke="#D4AF37"
                          strokeWidth={3}
                          dot={isDaily ? false : { fill: "#D4AF37", r: 4 }}
                          activeDot={{ r: 5 }}
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card> */}
              {/* Replace the entire Response Time */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-[#1E293B] flex items-center gap-2">
                    <Activity className="h-5 w-5 text-[#D4AF37]" />
                    AI Response Time
                  </CardTitle>
                  <CardDescription>
                    {isDaily
                      ? "Every request — last 30 days"
                      : "Every request — last 6 months"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {stats.responseTimeChart.length === 0 ? (
                    <EmptyChart message="No response time data yet" />
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <ScatterChart
                        margin={{ top: 10, right: 10, bottom: 0, left: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis
                          dataKey="ts"
                          type="number"
                          domain={["dataMin", "dataMax"]}
                          scale="time"
                          stroke="#6b7280"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(ts) =>
                            new Date(ts).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          }
                          // Show ~6 ticks regardless of range
                          tickCount={6}
                        />
                        <YAxis
                          dataKey="responseTime"
                          stroke="#6b7280"
                          tickFormatter={(v) => `${v}s`}
                          width={45}
                        />
                        {/* ZAxis with fixed size removes the "bubble" scaling behaviour */}
                        <ZAxis range={[25, 25]} />
                        <Tooltip content={<ResponseTimeTooltip />} />
                        <Scatter
                          data={stats.responseTimeChart}
                          fill="#D4AF37"
                          fillOpacity={0.75}
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
