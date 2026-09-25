import { Settings as Cog } from "lucide-react";
import { StrictMode, Suspense, lazy, useCallback, useEffect, useState } from "react";
import { loadKeymap } from "./lib/keys";
import { createRoot } from "react-dom/client";
import { Ghost } from "./components/Logo";
import { logoInner } from "./brand/logo";
import { Footer } from "./components/Footer";
import { api, setUnauthorizedHandler, type Site } from "./lib/api";
import { navigate, useLocation } from "./lib/url";
import "./styles.css";
import { SitePicker } from "./components/SitePicker";
import { Dashboard } from "./views/Dashboard";
import { applyTheme } from "./lib/theme";
import { closeAddSite, useAccountTab, useAddSite } from "./lib/account";
import { openSettings, useSettings, type SettingsTab } from "./lib/settings";
import { useLatest } from "./lib/update";
import { setOperator, setRole } from "./lib/me";
// Settings and the account dialog are their own screens: the dashboard should
// not carry them.
const Settings = lazy(() => import("./views/Settings").then((m) => ({ default: m.Settings })));
// Sign-in and first-run setup are for the minutes before someone is in: a
// signed-in owner never downloads them.
const Setup = lazy(() => import("./views/Auth").then((m) => ({ default: m.Setup })));
const Login = lazy(() => import("./views/Auth").then((m) => ({ default: m.Login })));
const FirstPassword = lazy(() => import("./views/Auth").then((m) => ({ default: m.FirstPassword })));
const UpdateDialog = lazy(() => import("./components/UpdateDialog"));
const SettingsDialog = lazy(() => import("./views/Settings").then((m) => ({ default: m.SettingsDialog })));
const AccountDialog = lazy(() => import("./views/Account").then((m) => ({ default: m.AccountDialog })));
const AddWizard = lazy(() => import("./views/Sites").then((m) => ({ default: m.AddWizard })));
// Only people with more than one site open it, so it loads when asked.
const AllSites = lazy(() => import("./views/AllSites").then((m) => ({ default: m.AllSites })));
import { ConfirmHost } from "./components/Confirm";
import { ShortcutsHost } from "./components/ShortcutsHost";
// A shared link is its own entry point: no setup, no sign-in, one site.
const SharedSite = lazy(() => import("./views/SharedSite"));
import { Toasts } from "./components/Toast";
import { managed, setManaged } from "./lib/managed";

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
      const s = await api.setupStatus();
      setManaged(s.managed);
      if (s.needs_setup) return setBoot({ state: "setup" });
      const me = await api.me().catch(() => null);
      if (!me) return setBoot({ state: "login" });
      setRole(me.role);
      setOperator(me.operator);
      loadKeymap(me.keys);
      // Before choosing their own password a person may do nothing else: the
      // server refuses the rest, so the sites are loaded after.
      const { sites } = me.must_change ? { sites: [] } : await api.sites();
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
    load();
  }, [load, shared]);

  const accountTab = useAccountTab(); // a hook: must run before any early return
  const adding = useAddSite();
  const settingsOpen = useSettings();
  // A newer release, if this owner's dashboard may look (lib/update.ts).
  const latest = useLatest(boot.state === "ready" ? boot.version : undefined, boot.state === "ready" ? boot.updateCheck : false);
  const [showUpdate, setShowUpdate] = useState(false);
  // An old /settings?site=…&tab=… link (the docs, a bookmark): open the dialog
  // over that site's dashboard and put the dashboard's address back.
  useEffect(() => {
    if (boot.state !== "ready" || path !== "/settings") return;
    const s = boot.sites.find((x) => x.id === params.get("site"));
    if (!s) return;
    const visitor = params.get("visitor");
    openSettings(s, (params.get("tab") as SettingsTab) || "site", visitor ? { visitor } : undefined, { replace: true });
  }, [boot, path, params]);

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
      <Suspense fallback={null}>
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
      </Suspense>
    );
  if (boot.state === "login") {
    // A managed instance has no sign-in page: people sign in at the provider.
    if (managed()) {
      location.assign(managed());
      return null;
    }
    return (
      <Suspense fallback={null}>
        <Login onDone={load} />
      </Suspense>
    );
  }

  // Signed in with a password someone else chose: choose one's own first.
  if (boot.mustChange && !managed())
    return (
      <Suspense fallback={null}>
        <FirstPassword email={boot.email} onDone={() => setBoot({ ...boot, mustChange: false })} />
      </Suspense>
    );

  const refreshSites = () =>
    api.sites().then(({ sites }) => setBoot({ ...boot, sites }));
  const settings = path === "/settings";
  const all = path === "/all";
  const domain = decodeURIComponent(path.slice(1));
  const site = settings
    ? (boot.sites.find((s) => s.id === params.get("site")) ?? null)
    : (boot.sites.find((s) => s.domain === domain) ?? null);

  const header = (
    // The header hides the site picker only on the settings page (an instance
    // with no site yet); settings over a dashboard keep the dashboard's header.
    <Header sites={boot.sites} current={site} settings={settings && !site} all={all} update={latest?.v} onUpdate={() => setShowUpdate(true)} />
  );
  return (
    <div className="app">
      {all ? (
        <Suspense fallback={<div className="skeleton" style={{ height: 320, margin: 24 }} />}>
          <AllSites sites={boot.sites} header={header} />
        </Suspense>
      ) : !site ? (
        <Suspense fallback={<div className="skeleton" style={{ height: 320, margin: 24 }} />}>
        <Settings
          sites={boot.sites}
          site={site}
          onSites={refreshSites}
          header={header}
        />
        </Suspense>
      ) : (
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
      )}
      <Footer version={boot.version} newer={latest?.v} onNewer={() => setShowUpdate(true)} />
      {showUpdate && latest && boot.version && (
        <Suspense fallback={null}>
          <UpdateDialog latest={latest} current={boot.version} onClose={() => setShowUpdate(false)} />
        </Suspense>
      )}
      <ShortcutsHost />
      <ConfirmHost />
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
  update,
  onUpdate,
}: {
  sites: Site[];
  current: Site | null;
  settings: boolean;
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
        onClick={(e) => (e.preventDefault(), navigate("/"))}
        dangerouslySetInnerHTML={{ __html: logoInner() }}
      />
      {update && (
        <button type="button" className="update-pill" onClick={onUpdate} title={`trckable ${update} is out`}>
          <span className="dot" aria-hidden="true" />
          <span className="num">v{update}</span>
          <span className="sr">is out: see how to upgrade</span>
        </button>
      )}

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
          onClick={() => openSettings(current)}
        >
          {/* A cog, with teeth. It used to be a circle with rays, which is a
              sun — so the one button that opens a site's settings looked like
              a light/dark switch. */}
          <Cog size={19} strokeWidth={1.75} color="var(--text-2)" aria-hidden="true" />
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
