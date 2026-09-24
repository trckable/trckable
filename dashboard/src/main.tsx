import { StrictMode, Suspense, lazy, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Ghost } from "./components/Logo";
import { logoInner } from "./brand/logo";
import { api, setUnauthorizedHandler, type Site } from "./lib/api";
import { navigate, useLocation } from "./lib/url";
import "./styles.css";
import { Setup, Login } from "./views/Auth";
import { SitePicker } from "./components/SitePicker";
import { Dashboard } from "./views/Dashboard";
import { applyTheme } from "./lib/theme";
import { closeAddSite, useAccountTab, useAddSite } from "./lib/account";
import { setRole } from "./lib/me";
// Settings and the account dialog are their own screens: the dashboard should
// not carry them.
const Settings = lazy(() => import("./views/Settings").then((m) => ({ default: m.Settings })));
const AccountDialog = lazy(() => import("./views/Account").then((m) => ({ default: m.AccountDialog })));
const AddWizard = lazy(() => import("./views/Sites").then((m) => ({ default: m.AddWizard })));
// Only people with more than one site open it, so it loads when asked.
const AllSites = lazy(() => import("./views/AllSites").then((m) => ({ default: m.AllSites })));
import { Shortcuts } from "./views/Shortcuts";
// A shared link is its own entry point: no setup, no sign-in, one site.
const SharedSite = lazy(() => import("./views/SharedSite"));
import { Toasts } from "./components/Toast";

try {
  applyTheme(localStorage.getItem("trckable:theme") ?? "system");
} catch {
  /* storage blocked */
}

type Boot =
  | { state: "loading" }
  | { state: "setup" }
  | { state: "login" }
  | { state: "ready"; email?: string; sites: Site[] }
  | { state: "error"; message: string };

function App() {
  const [boot, setBoot] = useState<Boot>({ state: "loading" });
  const { path, params } = useLocation();
  const shared = path === "/s" || path.startsWith("/s/");

  const load = useCallback(async () => {
    try {
      const s = await api.setupStatus();
      if (s.needs_setup) return setBoot({ state: "setup" });
      const me = await api.me().catch(() => null);
      if (!me) return setBoot({ state: "login" });
      setRole(me.role);
      const { sites } = await api.sites();
      setBoot({ state: "ready", email: me.email, sites });
    } catch (e) {
      setBoot({
        state: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  useEffect(() => {
    if (shared) return;
    setUnauthorizedHandler(() => setBoot({ state: "login" }));
    load();
  }, [load, shared]);

  const accountTab = useAccountTab(); // a hook: must run before any early return
  const adding = useAddSite();

  if (shared)
    return (
      <Suspense fallback={<Splash />}>
        <SharedSite />
      </Suspense>
    );

  // Keep the address bar honest about the screen shown.
  useEffect(() => {
    if (shared) return;
    if (boot.state === "setup" && path !== "/setup")
      navigate("/setup" + location.hash, { replace: true });
    if (boot.state === "login" && path !== "/login")
      navigate("/login", { replace: true });
    if (
      boot.state === "ready" &&
      (path === "/login" || path === "/setup" || path === "/")
    ) {
      const first = boot.sites[0];
      navigate(
        first
          ? "/" + encodeURIComponent(first.domain) + location.search
          : "/settings",
        { replace: true },
      );
    }
  }, [boot, path, shared]);

  if (boot.state === "loading") return <Splash />;
  if (boot.state === "error")
    return (
      <Splash>
        <p className="muted">Can't reach the trckable server: {boot.message}</p>
        <button type="button" className="btn" onClick={load}>
          Try again
        </button>
      </Splash>
    );
  if (boot.state === "setup")
    return (
      <Setup
        onDone={(site) => {
          load().then(() =>
            navigate(
              site ? "/" + encodeURIComponent(site.domain) : "/settings",
              { replace: true },
            ),
          );
        }}
      />
    );
  if (boot.state === "login") return <Login onDone={load} />;

  const refreshSites = () =>
    api.sites().then(({ sites }) => setBoot({ ...boot, sites }));
  const settings = path === "/settings";
  const all = path === "/all";
  const domain = decodeURIComponent(path.slice(1));
  const site = settings
    ? (boot.sites.find((s) => s.id === params.get("site")) ?? null)
    : (boot.sites.find((s) => s.domain === domain) ?? null);

  const header = (
    <Header sites={boot.sites} current={site} settings={settings} all={all} />
  );
  return (
    <div className="app">
      {all ? (
        <Suspense fallback={<div className="skeleton" style={{ height: 320, margin: 24 }} />}>
          <AllSites sites={boot.sites} header={header} />
        </Suspense>
      ) : settings || !site ? (
        <Suspense fallback={<div className="skeleton" style={{ height: 320, margin: 24 }} />}>
        <Settings
          sites={boot.sites}
          site={site}
          onSites={refreshSites}
          header={header}
        />
        </Suspense>
      ) : (
        <Dashboard
          key={site.id}
          site={site}
          sites={boot.sites}
          header={header}
        />
      )}
      <Shortcuts />
      <Toasts />
      {accountTab && (
        <Suspense fallback={null}>
        <AccountDialog
          tab={accountTab}
          sites={boot.sites}
          email={boot.email}
          onSites={refreshSites}
        />
        </Suspense>
      )}
      {adding && (
        <Suspense fallback={null}>
          <AddWizard onClose={closeAddSite} onSites={refreshSites} />
        </Suspense>
      )}
    </div>
  );
}

function Header({
  sites,
  current,
  settings,
  all,
}: {
  sites: Site[];
  current: Site | null;
  settings: boolean;
  all?: boolean;
}) {
  return (
    <>
      {/* The same logo as everywhere else (src/brand); on a phone the name
          gives its room to the site, the dates and the filters. */}
      <a
        href="/"
        aria-label="trckable home"
        className="brand tkb-logo"
        onClick={(e) => (e.preventDefault(), navigate("/"))}
        dangerouslySetInnerHTML={{ __html: logoInner() }}
      />
      {/* One control, two actions: which site, and that site's settings. They
          were two separate buttons sitting next to each other, which read as
          two unrelated things rather than one subject. */}
      {sites.length > 0 && !settings && (
        <div className="site-zone">
          <SitePicker sites={sites} current={current} all={all} />
          {current && (
        <button
          type="button"
          className="btn icon ghost gear"
          aria-label={`Settings for ${current.domain}`}
          title={`Settings for ${current.domain}`}
          onClick={() => navigate("/settings?site=" + encodeURIComponent(current.id))}
        >
          {/* A cog, with teeth. It used to be a circle with rays, which is a
              sun — so the one button that opens a site's settings looked like
              a light/dark switch. */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-.5a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </button>
          )}
        </div>
      )}
    </>
  );
}

function Splash({ children }: { children?: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        gap: 12,
        textAlign: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Ghost size={56} peek />
        {children}
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
