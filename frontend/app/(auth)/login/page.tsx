import Link from "next/link";
import { Activity, ArrowRight, ShieldCheck, Zap } from "lucide-react";
import { getStravaAuthUrl } from "@/lib/strava";

export default function LoginPage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const stravaAuthUrl = getStravaAuthUrl(`${appUrl}/api/auth/callback`);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060913] px-4 py-12">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 backdrop-blur-xl shadow-2xl">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-black shadow-lg shadow-emerald-500/20">
            <Activity className="h-6 w-6 stroke-[2.5]" />
          </div>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-white">
            Connect to EnduranceAI
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Authorize Strava to enable automatic activity telemetry ingestion and AI recovery modeling.
          </p>
        </div>

        <div className="space-y-4">
          <a
            href={stravaAuthUrl}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#FC4C02] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#FC4C02]/20 transition hover:bg-[#E34402]"
          >
            <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7.988 15.771h4.172" />
            </svg>
            Connect with Strava
          </a>

          <div className="relative flex items-center justify-center">
            <div className="w-full border-t border-slate-800" />
            <span className="bg-slate-900 px-3 text-xs uppercase tracking-wider text-slate-500">
              or demo mode
            </span>
            <div className="w-full border-t border-slate-800" />
          </div>

          <Link
            href="/dashboard"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white"
          >
            <Zap className="h-4 w-4 text-emerald-400" />
            Enter Sandbox / Demo Athlete
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4 text-xs text-slate-400 space-y-2">
          <div className="flex items-center gap-1.5 font-medium text-slate-300">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Security & Token Privacy
          </div>
          <p>
            Tokens are refreshed automatically via serverless worker jobs and stored in encrypted Supabase tables under Row Level Security.
          </p>
        </div>
      </div>
    </div>
  );
}
