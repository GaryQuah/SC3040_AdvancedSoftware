import Link from "next/link";
import { Activity, Radio, Sparkles, User, RefreshCw, BarChart2 } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#060913]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-black shadow-md shadow-emerald-500/20">
                <Activity className="h-5 w-5 stroke-[2.5]" />
              </div>
              <span className="text-lg font-bold tracking-tight text-white">
                Endurance<span className="text-emerald-400">AI</span>
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1 text-xs">
              <Link
                href="/dashboard"
                className="flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 font-medium text-emerald-400"
              >
                <BarChart2 className="h-3.5 w-3.5" />
                Training & Load
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Webhook / Queue Status Indicator */}
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="hidden sm:inline">QStash Sync</span> Ready
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-300">
              <User className="h-3.5 w-3.5 text-slate-400" />
              <span>Athlete Demo</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
