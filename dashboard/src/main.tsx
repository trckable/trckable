import { StrictMode, Suspense, lazy, useCallback, useEffect, useState } from "react";
import { loadKeymap } from "./lib/keys";
import { createRoot } from "react-dom/client";
import { Ghost } from "./components/Logo";
import { Loading } from "./components/loading/Loading";
import { logoInner } from "./brand/logo";
import { Footer } from "./components/Footer";
import { api, setUnauthorizedHandler, type Site } from "./lib/api"; import { startEarly, takeEarly } from "./lib/earlyStart";
import { navigate, useLocation } from "./lib/url";
import { AccountDialog, SettingsDialog, usePreloadDialogs } from "./views/dialogs";
import "./styles.css";
import { SiteZone } from "./features/header/SiteZone";
import { Dashboard } from "./views/Dashboard";
import { applyTheme } from "./lib/theme";
import { openAddSite, useAccountTab, useAddSite } from "./lib/account";
import { AddSiteHost } from "./features/onboarding/AddSiteHost";
import { siteForSegment } from "./lib/siteRoute";
import { landing, namesSite } from "./lib/landing";
import { openSettings, useSettings, type SettingsTab } from "./lib/settings";
import { useLatest } from "./lib/update";
import { setRole } from "./lib/me";
import { NoneShared, useGate } from "./features/onboarding/Gate";
// Settings and the account dialog are their own screens: the dashboard should not carry them.
// Sign-in and first-run setup are for the minutes before someone is in: a signed-in owner never downloads them.
const Setup = lazy(() => import("./views/Auth").then((m) => ({ default: m.Setup })));
const Login = lazy(() => import("./views/Auth").then((m) => ({ default: m.Login })));
const FirstPassword = lazy(() => import("./views/FirstPassword").then((m) => ({ default: m.FirstPassword })));
const UpdateDialog = lazy(() => import("./components/UpdateDialog"));
// Only people with more than one site open it, so it loads when asked.
const AllSites = lazy(() => import("./views/AllSites").then((m) => ({ default: m.AllSites })));
import { ConfirmHost } from "./components/Confirm";
import { ShortcutsHost } from "./components/ShortcutsHost";
// A shared link is its own entry point: no setup, no sign-in, one site.
const SharedSite = lazy(() => import("./views/SharedSite"));
import { Toasts } from "./components/Toast"; import { Hints } from "./features/hints/HintsDoor"; import { Boundary } from "./components/Boundary"; import "./lib/pwa";
import "./phone.css"; // last: what it sets on a phone wins over the styles imported before it
void import("./kit/glass").then((m) => m.startGlass()); // the glass: its own small chunk, asked for at once, so the first load keeps its weight
try {
  applyTheme(localStorage.getItem("trckable:theme") ?? "system");
} catch {
  /* storage blocked */
}

type Boot =
  | { state: "loading" }
  | { state: "setup" }
  | { state: "login" }
  | { state: "ready"; email?: string; version?: string; updateCheck?: boolean; mustChange?: boolean; sites: Site[] }
  | { state: "error"; message: string };

function App() {
  const [boot, setBoot] = useState<Boot>({ state: "loading" });
  const { path, params } = useLocation();
  const shared = path === "/s" || path.startsWith("/s/");

  const load = useCallback(async () => {
    try {
      const early = takeEarly(); // /me and /sites went out with the script, and /setup goes now: one round trip, not three
      const s = await api.setupStatus();
      if (s.needs_setup) {
        setBoot({ state: "setup" });
        return;
      }
      const me = await early.me;
      if (!me) {
        setBoot({ state: "login" });
        return;
      }
      setRole(me.role);
      loadKeymap(me.keys);
      // Before choosing their own password a person may do nothing else (the server refuses /sites).
      const { sites } = me.must_change ? { sites: [] } : ((await early.sites) ?? (await api.sites()));
      setBoot({ state: "ready", email: me.email, version: me.version, updateCheck: me.update_check, mustChange: me.must_change, sites });
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches the boot state from the server; setBoot runs when it answers
    void load();
  }, [load, shared]);

  const accountTab = useAccountTab(); // a hook: must run before any early return
  usePreloadDialogs(boot.state === "ready");
  const adding = useAddSite();
  const { gated, pass } = useGate(boot.state === "ready" ? boot.sites : null, boot.state === "ready" && !!boot.mustChange, path);
  const settingsOpen = useSettings();
  // A newer release, if this owner's dashboard may look (lib/update.ts).
  const latest = useLatest(boot.state === "ready" ? boot.version : undefined, boot.state === "ready" ? boot.updateCheck : false);
  const [showUpdate, setShowUpdate] = useState(false);
  // An old /settings?site=…&tab=… link (the docs, a bookmark) opens that
  // site's settings over its dashboard; the page itself is gone, and any other
  // /settings address falls through to the main dashboard below.
  useEffect(() => {
    if (boot.state !== "ready" || gated || path !== "/settings") return;
    const s = boot.sites.find((x) => x.id === params.get("site"));
    if (!s) return;
    const visitor = params.get("visitor");
    openSettings(s, (params.get("tab") as SettingsTab) || "site", visitor ? { visitor } : undefined, { replace: true });
  }, [boot, gated, path, params]);

  // Keep the address bar honest about the screen shown.
  useEffect(() => {
    if (shared) return;
    if (boot.state === "setup" && path !== "/setup")
      navigate("/setup" + location.hash, { replace: true });
    if (boot.state === "login" && path !== "/login")
      navigate("/login", { replace: true });
    // Signed in at the root, or at an address that names none of this
    // person's sites (a typo, someone else's site, one since removed): their
    // main dashboard, never a page made up for an address it does not know.
    if (boot.state === "ready" && !gated && !(path === "/settings" && namesSite(boot.sites, params)) && path !== "/all" && !siteForSegment(boot.sites, path.slice(1))) {
      const to = landing(boot.sites, new URLSearchParams(location.search));
      navigate(to.path, { replace: true });
      if (to.wizard) openAddSite();
    }
  }, [boot, path, shared, gated, params]);

  if (shared)
    return (
      <Suspense fallback={<Loading size="page" />}>
        <SharedSite />
      </Suspense>
    );

  if (boot.state === "loading") return <Loading size="page" />;
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
      <Suspense fallback={<Loading size="page" />}>
      <Setup
        onDone={(site) => {
          void load().then(() =>
            navigate(
              site ? "/" + encodeURIComponent(site.domain) : "/",
              { replace: true },
            ),
          );
        }}
      />
      </Suspense>
    );
  if (boot.state === "login") {
    return (
      <Suspense fallback={<Loading size="page" />}>
        <Login onDone={load} />
      </Suspense>
    );
  }

  // Signed in with a password someone else chose: choose one's own first.
  if (boot.mustChange)
    return (
      <Suspense fallback={<Loading size="page" />}>
        <FirstPassword email={boot.email} onDone={() => setBoot({ ...boot, mustChange: false })} />
      </Suspense>
    );

  const refreshSites = () =>
    api.sites().then(({ sites }) => setBoot({ ...boot, sites }));
  const all = path === "/all";
  const site = siteForSegment(boot.sites, path.slice(1));

  const header = (
    <Header sites={boot.sites} current={site} all={all} update={latest?.v} onUpdate={() => setShowUpdate(true)} />
  );
  // Until an owner's first site has had a visit, only the first run (Gate).
  let page: React.ReactNode;
  if (gated) page = null;
  else if (boot.sites.length === 0) page = <NoneShared />;
  else if (all)
    page = (
      <Suspense fallback={<Loading height={320} />}>
        <AllSites sites={boot.sites} header={header} />
      </Suspense>
    );
  else if (!site)
    page = null; // an unknown address (/settings among them), on its way to the main dashboard
  else
    page = (
      <>
        <Dashboard
          key={site.id}
          site={site}
          sites={boot.sites}
          header={header}
        />
        {/* Settings open over the dashboard they belong to. */}
        {settingsOpen?.site === site.id && (
          <Suspense fallback={null}>
            <SettingsDialog sites={boot.sites} site={site} tab={settingsOpen.tab} onSites={refreshSites} />
          </Suspense>
        )}
      </>
    );
  return (
    <div className="app">
      {page}
      <Footer version={boot.version} newer={latest?.v} onNewer={() => setShowUpdate(true)} />
      {showUpdate && latest && boot.version && (
        <Suspense fallback={null}>
          <UpdateDialog latest={latest} current={boot.version} onClose={() => setShowUpdate(false)} />
        </Suspense>
      )}
      <ShortcutsHost />
      <ConfirmHost />
      <Toasts /><Hints />
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
      <AddSiteHost open={adding || gated} required={gated} onPassed={pass} sites={boot.sites} onSites={refreshSites} />
    </div>
  );
}

function Header({
  sites,
  current,
  all,
  update,
  onUpdate,
}: {
  sites: Site[];
  current: Site | null;
  all?: boolean;
  /** A newer version, when there is one: a small lime pill by the logo. */
  update?: string;
  onUpdate?: () => void;
}) {
  return (
    <>
      {/* The full logo, the same as everywhere else (src/brand). On a phone
          the header has room for the ghost only (styles.css). */}
      <a
        href="/"
        aria-label="trckable home"
        className="brand tkb-logo"
        onClick={(e) => {
          e.preventDefault();
          navigate("/");
        }}
        dangerouslySetInnerHTML={{ __html: logoInner() }}
      />
      {update && (
        <button type="button" className="update-pill" onClick={onUpdate} title={`trckable ${update} is out`}>
          <span className="dot" aria-hidden="true" />
          <span className="num">v{update}</span>
          <span className="sr">is out: see how to upgrade</span>
        </button>
      )}

      {/* One control, two actions: which site, and that site's settings. */}
      {sites.length > 0 && <SiteZone sites={sites} current={current} all={all} />}
    </>
  );
}

// The server could not be reached: the ghost, still, and a way to retry.
function Splash({ children }: { children?: React.ReactNode }) {
  return (
    <main className="ld ld-page">
      <Ghost size={56} />
      {children}
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root");
startEarly(); // first requests leave now (lib/earlyStart.ts)
createRoot(root).render(
  <StrictMode>
    <Boundary><App /></Boundary>
  </StrictMode>,
);
