import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { 
  Activity, 
  Link2, 
  CheckCircle2, 
  Settings2, 
  Bell, 
  Shield, 
  User, 
  ArrowRight,
  Unplug
} from "lucide-react";

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("strava_access_token")?.value;
  const athleteCookie = cookieStore.get("strava_athlete")?.value;
  const athlete = athleteCookie ? JSON.parse(athleteCookie) : null;

//   const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
//   const redirectUri = process.env.NEXT_PUBLIC_STRAVA_REDIRECT_URI;
  const clientId = "276434"; // Replace with your numeric Strava ID
  const redirectUri = "http://localhost:3000/api/auth/callback";
  const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&approval_prompt=force&scope=activity:read_all,profile:read_all`;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Settings</h1>
        <p className="mt-2 text-slate-400 text-sm">
          Manage your integrations, telemetry preferences, and account security.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Sidebar Navigation (Future proofing) */}
        <div className="space-y-1">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 font-medium text-sm border border-emerald-500/20">
            <Link2 className="h-4 w-4" />
            Integrations
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:bg-slate-900/60 hover:text-slate-200 font-medium text-sm transition-colors">
            <Settings2 className="h-4 w-4" />
            Preferences
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:bg-slate-900/60 hover:text-slate-200 font-medium text-sm transition-colors">
            <Bell className="h-4 w-4" />
            Notifications
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:bg-slate-900/60 hover:text-slate-200 font-medium text-sm transition-colors">
            <Shield className="h-4 w-4" />
            Security
          </button>
        </div>

        {/* Settings Content Area */}
        <div className="md:col-span-2 space-y-6">
          
          {/* Strava Integration Card */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-sm relative overflow-hidden">
            {/* Ambient Glow */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-[#FC4C02]/10 blur-[50px] rounded-full pointer-events-none" />
            
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FC4C02]/10 border border-[#FC4C02]/20 text-[#FC4C02]">
                  <Activity className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    Strava
                    {accessToken && (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="h-3 w-3" />
                        Connected
                      </span>
                    )}
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Sync activities, telemetry streams, and gear wear automatically.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-slate-800/60 pt-6">
              {accessToken ? (
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    {athlete?.profile && athlete.profile !== "avatar/athlete/large.png" ? (
                      <img
                        src={athlete.profile}
                        alt="Profile"
                        className="h-10 w-10 rounded-full border border-slate-700"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 border border-slate-700">
                        <User className="h-5 w-5 text-slate-400" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-slate-200">
                        {athlete?.firstname} {athlete?.lastname}
                      </p>
                      <p className="text-xs text-slate-500">ID: {athlete?.id}</p>
                    </div>
                  </div>
                  
                  <form action={async () => {
                    "use server";
                    const c = await cookies();
                    c.delete("strava_access_token");
                    c.delete("strava_athlete");
                    redirect("/dashboard/settings");
                  }}>
                    <button type="submit" className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-red-400 hover:border-red-900/50">
                      <Unplug className="h-3.5 w-3.5" />
                      Disconnect
                    </button>
                  </form>
                </div>
              ) : (
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <p className="text-sm text-slate-400 max-w-sm">
                    Connect your account to enable TRIMP tracking, ACWR modeling, and Gemini coach analysis.
                  </p>
                  <Link
                    href={authUrl}
                    className="flex items-center gap-2 rounded-lg bg-[#FC4C02] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#FC4C02]/20 transition hover:bg-[#E34402]"
                  >
                    Connect Strava
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </div>
          </section>

          {/* Future Setting Card Placeholder */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/20 p-6 opacity-60 grayscale">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-slate-400">
                <Activity className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Apple Health (Coming Soon)</h3>
                <p className="mt-1 text-xs text-slate-400">
                  Import resting heart rate and sleep metrics for deeper recovery analysis.
                </p>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}