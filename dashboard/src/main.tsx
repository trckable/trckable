import { StrictMode, Suspense, lazy, useCallback, useEffect, useState } from "react";
import { loadKeymap } from "./lib/keys";
import { createRoot } from "react-dom/client";
import { Ghost } from "./components/Logo";
import { Booting } from "./components/skeleton/DashSkeleton"; import { Loading } from "./components/loading/Loading";
import { useBootCache } from "./lib/bootCache";
import { api, setUnauthorizedHandler, type Site } from "./lib/api"; import { startEarly, takeEarly, takeSetup } from "./lib/earlyStart";
import { navigate, useLocation } from "./lib/url"; import "./lib/legacyPaths";
import { AccountDialog, SettingsDialog, usePreloadDialogs } from "./views/dialogs";
import "./kit/breakpoints.css"; import "./styles.css"; import "./field.css";
import { lazyLoad, whenIdle } from "./lib/lazyLoad";
import { routeOf, SubRoute } from "./features/subpage";
import { useBootAddress } from "./lib/useBootAddress";
import { SiteHost } from "./views/SiteHost";
import { applySavedTheme } from "./lib/theme";
import { NO_SITES, useLiveSites } from "./lib/useLiveSites";
import { useAccountTab, useAddSite } from "./lib/account";
import { AddSiteHost } from "./features/onboarding/AddSiteHost";
import { useSettingsAddress } from "./features/settingsAddress";
import { useLatest } from "./lib/update";
import { setRole } from "./lib/me";
import { can } from "./lib/permissions";
import { NoneShared, NoSites, useGate } from "./features/onboarding/Gate";
// The header of every page is its own chunk, fetched at once after the first paint: the first load carries only the page's boxes.
const PageBar = lazyLoad(() => import("./v2/PageBar").then((m) => ({ default: m.PageBar })));
whenIdle(PageBar.preload);
// Settings and the account dialog are their own screens: the dashboard should not carry them.
// Sign-in and first-run setup are for the minutes before someone is in: a signed-in owner never downloads them.
const Setup = lazy(() => import("./views/Auth").then((m) => ({ default: m.Setup })));
const Login = lazy(() => import("./views/Auth").then((m) => ({ default: m.Login })));
const FirstPassword = lazy(() => import("./views/FirstPassword").then((m) => ({ default: m.FirstPassword })));
const UpdateDialog = lazy(() => import("./components/UpdateDialog"));
// Only people with more than one site open it, so it loads when asked.
const TeamHome = lazy(() => import("./views/team/TeamHome").then((m) => ({ default: m.TeamHome })));
import { ConfirmHost } from "./components/Confirm";
import { ShortcutsHost } from "./components/ShortcutsHost";
// A shared link is its own entry point: no setup, no sign-in, one site.
const SharedSite = lazy(() => import("./views/SharedSite"));
import { Toasts } from "./components/Toast"; import { Hints } from "./features/hints/HintsDoor"; import { Boundary } from "./components/Boundary"; import "./lib/pwa"; import "./lib/offline";
import "./phone.css"; // last: what it sets on a phone wins over the styles imported before it
import { Footer } from "./components/Footer";
void import("./kit/glass").then((m) => m.startGlass()); // the glass: its own small chunk, asked for at once, so the first load keeps its weight
applySavedTheme();
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
      const s = await takeSetup();
      if (s.needs_setup) {
        setBoot({ state: "setup" });
        return;
      }
      const me = await early.me;
      if (!me) {
        setBoot({ state: "login" });
        return;
      }
      setRole(me.role, me.mentions, me.answers);
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
  useBootCache(boot.state, boot.state === "ready" ? boot.sites : undefined); // what the next refresh paints first
  useEffect(() => {
    if (shared) return;
    setUnauthorizedHandler(() => setBoot({ state: "login" }));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches the boot state from the server; setBoot runs when it answers
    void load();
  }, [load, shared]);

  const liveSites = boot.state === "ready" ? boot.sites : NO_SITES;
  const applySites = useCallback((sites: Site[]) => setBoot((b) => (b.state === "ready" ? { ...b, sites } : b)), []);
  useLiveSites(boot.state === "ready" && !boot.mustChange, liveSites, applySites);
  const accountTab = useAccountTab(); // a hook: must run before any early return
  usePreloadDialogs(boot.state === "ready");
  const adding = useAddSite();
  const { gated, pass } = useGate(boot.state === "ready" ? boot.sites : null, boot.state === "ready" && !!boot.mustChange, path, boot.state === "ready" ? boot.email : undefined);
  const settingsOpen = useSettingsAddress(boot.state === "ready" && !gated ? boot.sites : null, path, params); // the dialog, and the address that names a section of it
  // A newer release, if this owner's dashboard may look (lib/update.ts).
  const latest = useLatest(boot.state === "ready" ? boot.version : undefined, boot.state === "ready" ? boot.updateCheck : false);
  const [showUpdate, setShowUpdate] = useState(false);
  useBootAddress({ state: boot.state, sites: boot.state === "ready" ? boot.sites : [], gated, path, params, shared });

  if (shared)
    return (
      <Suspense fallback={<Loading size="page" />}>
        <SharedSite />
      </Suspense>
    );

  if (boot.state === "loading") return <Booting />;
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
  const all = path === "/sites", { site, sub } = routeOf(boot.sites, path);

  const header = <Suspense fallback={<div className="bar-hold" aria-hidden="true" />}><PageBar sites={boot.sites} site={all ? null : site} update={latest?.v} onUpdate={() => setShowUpdate(true)} /></Suspense>;
  // Until an owner's first site has had a visit, only the first run (Gate).
  let page: React.ReactNode;
  if (gated) page = null;
  else if (boot.sites.length === 0) page = can("site.add") ? <NoSites /> : <NoneShared />;
  else if (all)
    page = (
      <Suspense fallback={<Loading height={320} />}>
        <TeamHome sites={boot.sites} header={header} />
      </Suspense>
    );
  else if (site && sub) page = <SubRoute {...{ sub, site, header }} />;
  else if (!site)
    page = null; // an unknown address (/settings among them), on its way to the main dashboard
  else
    page = (
      <>
        <SiteHost key={site.id} site={site} sites={boot.sites} />
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
      <Footer version={boot.version} newer={latest?.v} onNewer={() => setShowUpdate(true)} site={site?.id} sites={boot.sites} />
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
// A development build can answer from a fixture (?fixture=hn): the clock and the API, before the first request leaves.
if (import.meta.env.DEV) await import("./dev/fixture").then((m) => m.installFixture());
startEarly(); // first requests leave now (lib/earlyStart.ts)
createRoot(root).render(
  <StrictMode>
    <Boundary><App /></Boundary>
  </StrictMode>,
);
