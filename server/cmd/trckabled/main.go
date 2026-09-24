// trckabled is the trckable server: one binary for ingest, storage, API and
// dashboard.
//
//	trckabled [serve]               start the server (default)
//	trckabled site add <domain>     add a site and print its id
//	trckabled site list             list sites
//	trckabled admin reset-password <email>
//	trckabled admin add-user <email> [--role viewer|owner]
//	trckabled admin list-users | set-role <email> <role> | remove-user <email>
//	trckabled admin disable-2fa <email>
//	trckabled payments list | sync [site] | reprocess <site>
//	trckabled version               print the version
package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/trckable/trckable/server/internal/auth"
	"github.com/trckable/trckable/server/internal/backup"
	"github.com/trckable/trckable/server/internal/config"
	"github.com/trckable/trckable/server/internal/geo"
	"github.com/trckable/trckable/server/internal/importer"
	"github.com/trckable/trckable/server/internal/revenue"
	"github.com/trckable/trckable/server/internal/secrets"
	"github.com/trckable/trckable/server/internal/server"
	"github.com/trckable/trckable/server/internal/store/duck"
	"github.com/trckable/trckable/server/internal/store/sqlite"
	"github.com/trckable/trckable/server/internal/wal"
)

func main() {
	cfg := config.Load()
	setupLogging(cfg.LogLevel)
	if err := cfg.Check(); err != nil {
		slog.Error("trckabled cannot start", "err", err)
		os.Exit(1)
	}
	cmd := "serve"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}
	var err error
	switch cmd {
	case "serve":
		err = serve(cfg)
	case "site":
		err = site(cfg, os.Args[2:])
	case "admin":
		err = admin(cfg, os.Args[2:])
	case "payments":
		err = paymentsCmd(cfg, os.Args[2:])
	case "geo":
		err = geoCmd(os.Args[2:])
	case "backup":
		err = backupCmd(cfg, os.Args[2:])
	case "restore":
		err = restoreCmd(cfg, os.Args[2:])
	case "import":
		err = importCmd(cfg, os.Args[2:])
	case "version", "--version", "-v":
		fmt.Println("trckabled", server.Version)
	case "help", "--help", "-h":
		usage()
	default:
		usage()
		os.Exit(2)
	}
	if err != nil {
		slog.Error("trckabled failed", "err", err)
		os.Exit(1)
	}
}

func serve(cfg config.Config) error {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	s, err := server.New(ctx, cfg)
	if err != nil {
		return err
	}
	return s.Run(ctx)
}

func site(cfg config.Config, args []string) error {
	if err := os.MkdirAll(cfg.DataDir, 0o700); err != nil {
		return err
	}
	ctl, err := sqlite.Open(context.Background(), cfg.SQLitePath())
	if err != nil {
		return err
	}
	defer ctl.Close()
	switch {
	case len(args) == 2 && args[0] == "add":
		id, err := ctl.CreateSite(context.Background(), sqlite.DefaultAccount, args[1], "")
		if err != nil {
			return err
		}
		fmt.Println(id)
		return nil
	case len(args) == 1 && args[0] == "list":
		sites, err := ctl.AllSites(context.Background())
		if err != nil {
			return err
		}
		for _, s := range sites {
			fmt.Printf("%s\t%s\t%s\n", s.ID, s.Domain, s.ProxyKey)
		}
		return nil
	}
	return fmt.Errorf("usage: trckabled site add <domain> | site list")
}

const adminUse = `usage:
  trckabled admin reset-password <email>
  trckabled admin add-user <email> [--role viewer|owner]   (viewer by default)
  trckabled admin list-users
  trckabled admin set-role <email> <viewer|owner>
  trckabled admin remove-user <email>
  trckabled admin disable-2fa <email>                      (lost phone, no codes)`

func admin(cfg config.Config, args []string) error {
	if len(args) == 0 {
		return errors.New(adminUse)
	}
	ctx := context.Background()
	ctl, err := sqlite.Open(ctx, cfg.SQLitePath())
	if err != nil {
		return err
	}
	defer ctl.Close()

	switch args[0] {
	case "reset-password":
		if len(args) != 2 {
			return errors.New(adminUse)
		}
		password, generated := adminPassword()
		if err := ctl.ResetPassword(ctx, args[1], password); err != nil {
			return err
		}
		if generated {
			fmt.Println("new password:", password)
		}
		fmt.Fprintln(os.Stderr, "password updated; all sessions for", args[1], "were signed out")
		return nil

	case "add-user":
		if len(args) < 2 {
			return errors.New(adminUse)
		}
		role := sqlite.RoleViewer
		for i := 2; i < len(args); i++ {
			if args[i] == "--role" && i+1 < len(args) {
				role = args[i+1]
			} else if r, ok := strings.CutPrefix(args[i], "--role="); ok {
				role = r
			}
		}
		password, generated := adminPassword()
		p, err := ctl.AddUser(ctx, sqlite.DefaultAccount, args[1], password, role)
		if err != nil {
			return err
		}
		if generated {
			fmt.Println("password:", password)
		}
		fmt.Fprintf(os.Stderr, "%s added as %s; they change this password after signing in\n", p.Email, p.Role)
		return nil

	case "list-users":
		people, err := ctl.People(ctx, sqlite.DefaultAccount)
		if err != nil {
			return err
		}
		for _, p := range people {
			two := ""
			if p.TwoStep {
				two = "  two-step on"
			}
			fmt.Printf("%-8s %s%s\n", p.Role, p.Email, two)
		}
		return nil

	case "disable-2fa":
		// The way back in when the phone is gone and the recovery codes with
		// it. It needs the server itself, which is the point.
		if len(args) != 2 {
			return errors.New(adminUse)
		}
		id, err := userIDFor(ctx, ctl, args[1])
		if err != nil {
			return err
		}
		if err := ctl.DisableTwoStep(ctx, id); err != nil {
			return err
		}
		fmt.Fprintln(os.Stderr, "two-step sign-in is off for", args[1], "— set it up again from Your account")
		return nil

	case "set-role", "remove-user":
		want := 3
		if args[0] == "remove-user" {
			want = 2
		}
		if len(args) != want {
			return errors.New(adminUse)
		}
		id, err := userIDFor(ctx, ctl, args[1])
		if err != nil {
			return err
		}
		if args[0] == "remove-user" {
			if err := ctl.RemoveUser(ctx, sqlite.DefaultAccount, id); err != nil {
				return err
			}
			fmt.Fprintln(os.Stderr, args[1], "removed, along with every session they held")
			return nil
		}
		if err := ctl.SetRole(ctx, sqlite.DefaultAccount, id, args[2]); err != nil {
			return err
		}
		fmt.Fprintln(os.Stderr, args[1], "is now a", args[2])
		return nil
	}
	return errors.New(adminUse)
}

// userIDFor looks someone up by the address they sign in with.
func userIDFor(ctx context.Context, ctl *sqlite.Store, email string) (string, error) {
	people, err := ctl.People(ctx, sqlite.DefaultAccount)
	if err != nil {
		return "", err
	}
	for _, p := range people {
		if strings.EqualFold(p.Email, email) {
			return p.ID, nil
		}
	}
	return "", fmt.Errorf("no account for %s", email)
}

// adminPassword never takes a password as an argument (it would land in shell
// history and in ps). Piped stdin wins; otherwise one is generated and printed.
func adminPassword() (string, bool) {
	if fi, _ := os.Stdin.Stat(); fi != nil && fi.Mode()&os.ModeCharDevice == 0 {
		line, _ := bufio.NewReader(os.Stdin).ReadString('\n')
		if pw := strings.TrimRight(line, "\r\n"); pw != "" {
			return pw, false
		}
	}
	return auth.Token("", 12), true
}

// paymentsCmd runs the money maintenance commands. It touches SQLite only, so
// it is safe to run while the server is up (the ledger is shared; a running
// server picks up the changes, though its report cache may lag by a minute).
func paymentsCmd(cfg config.Config, args []string) error {
	const use = "usage: trckabled payments list | sync [site] [days] | reprocess <site>"
	if len(args) == 0 {
		return errors.New(use)
	}
	ctx := context.Background()
	ctl, err := sqlite.Open(ctx, cfg.SQLitePath())
	if err != nil {
		return err
	}
	defer ctl.Close()
	box, err := secrets.Load(cfg.DataDir, cfg.Secret)
	if err != nil {
		return err
	}
	svc, err := revenue.New(ctx, ctl.DB, box)
	if err != nil {
		return err
	}
	if svc.KeyErr != nil {
		return svc.KeyErr
	}
	sites, err := ctl.AllSites(ctx)
	if err != nil {
		return err
	}
	resolve := func(arg string) (sqlite.SiteRow, error) {
		for _, s := range sites {
			if s.ID == arg || strings.EqualFold(s.Domain, arg) {
				return s, nil
			}
		}
		return sqlite.SiteRow{}, fmt.Errorf("unknown site %q (try: trckabled site list)", arg)
	}

	switch args[0] {
	case "list":
		for _, st := range sites {
			conns, err := svc.Connections(ctx, st.ID, cfg.BaseURL)
			if err != nil {
				return err
			}
			for _, c := range conns {
				last := "no events yet"
				if c.LastEvent != nil {
					last = "last event " + time.Unix(*c.LastEvent, 0).Format(time.RFC3339)
				}
				mode := c.Mode
				if c.Managed {
					mode += ", managed"
				}
				fmt.Printf("%s\t%s\t%s (%s)\t%d payments\t%d pending\t%s\n", st.Domain, c.ID, c.Provider, mode, c.Payments, c.Pending, last)
				if c.LastError != "" {
					fmt.Printf("\t\tlast sync error: %s\n", c.LastError)
				}
			}
		}
		return nil

	case "sync":
		days := 30
		targets := sites
		if len(args) > 1 {
			st, err := resolve(args[1])
			if err != nil {
				return err
			}
			targets = []sqlite.SiteRow{st}
		}
		if len(args) > 2 {
			if days, err = strconv.Atoi(args[2]); err != nil || days <= 0 {
				return errors.New(use)
			}
		}
		total := 0
		for _, st := range targets {
			conns, err := svc.Connections(ctx, st.ID, "")
			if err != nil {
				return err
			}
			for _, c := range conns {
				if !c.Managed {
					continue // no API key: nothing to reconcile against
				}
				n, err := svc.Sync(ctx, c.ID, time.Duration(days)*24*time.Hour)
				if err != nil {
					fmt.Fprintf(os.Stderr, "%s %s: %v\n", st.Domain, c.Provider, err)
					continue
				}
				fmt.Printf("%s %s: %d new events\n", st.Domain, c.Provider, n)
				total += n
			}
		}
		n, err := svc.Process(ctx)
		if err != nil {
			return err
		}
		fmt.Printf("%d events fetched, %d applied to the ledger\n", total, n)
		return nil

	case "reprocess":
		if len(args) != 2 {
			return errors.New(use)
		}
		st, err := resolve(args[1])
		if err != nil {
			return err
		}
		n, err := svc.Reprocess(ctx, st.ID)
		if err != nil {
			return err
		}
		fmt.Printf("%s: ledger rebuilt from %d stored webhooks\n", st.Domain, n)
		return nil
	}
	return errors.New(use)
}

func usage() {
	fmt.Fprintln(os.Stderr, `trckabled — trckable server

usage:
  trckabled [serve]            start the server
  trckabled site add <domain>  add a site and print its id
  trckabled site list          list sites
  trckabled admin reset-password <email>
                               set a new password (read from stdin, or
                               generated and printed) and sign out everywhere
  trckabled payments list      payment connections and their health
  trckabled payments sync [site] [days]
                               pull recent payments from the providers
  trckabled payments reprocess <site>
                               rebuild the ledger from the stored webhooks
  trckabled backup [dir]       write an encrypted backup (default: <data>/backups)
  trckabled geo update <dir> [city]
                               download the geo databases into a shared directory
                               that instances read with TRCKABLE_GEO_DIR
  trckabled restore <file> <dir>
                               unpack a backup into an empty directory
  trckabled import <site> <file.ndjson|csv>
                               bring history in from another tool (one row per
                               pageview or goal; "-" reads standard input)
  trckabled version            print the version

configuration: TRCKABLE_* environment variables (see docs/self-host/configuration)`)
}

func setupLogging(level string) {
	var l slog.Level
	switch level {
	case "debug":
		l = slog.LevelDebug
	case "warn":
		l = slog.LevelWarn
	case "error":
		l = slog.LevelError
	}
	h := slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: l})
	slog.SetDefault(slog.New(h).With("app", "trckable"))
}

// backupCmd writes one encrypted backup and prints where it landed. It runs
// without the server, so it can be a cron job on the host as well.
func backupCmd(cfg config.Config, args []string) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	dir := filepath.Join(cfg.DataDir, "backups")
	out := dir
	if len(args) > 0 && args[0] != "" {
		out = args[0]
	}
	// A running server holds the analytics store, and a backup without it
	// is not one. Ask that server to write it, and wait for the file.
	d, err := duck.Open(ctx, cfg.DuckPath(), duck.Options{})
	if err != nil {
		path, err := backupViaServer(ctx, dir)
		if err != nil {
			return err
		}
		if out != dir {
			dst := filepath.Join(out, filepath.Base(path))
			if err := copyFile(path, dst); err != nil {
				return err
			}
			path = dst
		}
		fmt.Println(path)
		return nil
	}
	defer d.Close()
	ctl, err := sqlite.Open(ctx, cfg.SQLitePath())
	if err != nil {
		return err
	}
	defer ctl.Close()
	box, err := secrets.Load(cfg.DataDir, cfg.Secret)
	if err != nil {
		return err
	}
	st := backup.Store{DataDir: cfg.DataDir, Ctl: ctl.DB, Duck: d.DB, Key: box.Derive("backup")}
	st.Progress = func(what string) { fmt.Fprintln(os.Stderr, "…", what) }
	res, err := backup.Run(ctx, st, out)
	if err != nil {
		return err
	}
	fmt.Printf("%s  %.1f MB  in %s\n", res.Path, float64(res.Bytes)/(1<<20), res.Took.Round(time.Millisecond))
	return nil
}

// backupViaServer asks the running server for a backup through its trigger
// file and returns the path of the file it writes.
func backupViaServer(ctx context.Context, dir string) (string, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	asked := time.Now()
	if err := os.WriteFile(filepath.Join(dir, server.TriggerFile), nil, 0o600); err != nil {
		return "", err
	}
	fmt.Fprintln(os.Stderr, "… the server is running: asking it for a backup")
	deadline := time.After(2 * time.Hour)
	for {
		select {
		case <-ctx.Done():
			os.Remove(filepath.Join(dir, server.TriggerFile))
			return "", ctx.Err()
		case <-deadline:
			return "", errors.New("the server did not write a backup within two hours; see its log")
		case <-time.After(time.Second):
		}
		// The server renames a backup into place only when it is complete,
		// so the first *.tkb newer than the request is the answer.
		entries, _ := os.ReadDir(dir)
		for _, e := range entries {
			info, err := e.Info()
			if err == nil && strings.HasSuffix(e.Name(), ".tkb") && info.ModTime().After(asked) {
				return filepath.Join(dir, e.Name()), nil
			}
		}
	}
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return errors.Join(out.Sync(), out.Close())
}

// geoCmd fills a shared geo directory: the country (or city) database and the
// network database behind stricter bot filtering. Run it monthly from cron on
// a machine with many instances, and every instance maps the same files.
func geoCmd(args []string) error {
	if len(args) < 2 || args[0] != "update" {
		return errors.New("usage: trckabled geo update <dir> [city]")
	}
	mode := geo.Country
	if len(args) > 2 && args[2] == "city" {
		mode = geo.City
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	for _, m := range []geo.Mode{mode, geo.ASN} {
		fmt.Fprintf(os.Stderr, "… %s database\n", m)
		if err := geo.New(m, args[1]).Update(ctx); err != nil {
			return fmt.Errorf("%s database: %w", m, err)
		}
	}
	fmt.Println("done: point instances at it with TRCKABLE_GEO_DIR=" + args[1])
	return nil
}

// restoreCmd turns a backup into a data directory the server starts from.
func restoreCmd(cfg config.Config, args []string) error {
	if len(args) < 2 {
		return errors.New("usage: trckabled restore <file.tkb> <empty dir>")
	}
	// The key must be the one that wrote the backup. secrets.Load would
	// quietly make a new one if there were none, and every restore would
	// then fail as "wrong key", so say what is missing instead.
	keyFile := filepath.Join(cfg.DataDir, "secret.key")
	if cfg.Secret == "" {
		if _, err := os.Stat(keyFile); err != nil {
			return server.ErrNoKey
		}
	}
	box, err := secrets.Load(cfg.DataDir, cfg.Secret)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	res, err := server.Restore(ctx, args[0], args[1], box.Derive("backup"))
	if err != nil {
		return err
	}
	// Payment keys inside are sealed with the same secret: an instance that
	// kept it in a file needs that file next to its data.
	if cfg.Secret == "" {
		b, err := os.ReadFile(keyFile)
		if err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(args[1], "secret.key"), b, 0o600); err != nil {
			return err
		}
	}
	fmt.Printf("restored into %s: %d sites, %d people", args[1], res.Sites, res.People)
	if res.Analytics {
		fmt.Printf(", %d events", res.Events)
	}
	fmt.Println()
	if !res.Analytics {
		fmt.Println("this backup was taken while the server held the analytics store; the write-ahead log in it replays the events it kept")
	}
	fmt.Println("point TRCKABLE_DATA_DIR at it and start trckabled; the write-ahead log replays anything newer than the backup")
	if cfg.Secret != "" {
		fmt.Println("keep TRCKABLE_SECRET set to the same value")
	}
	return nil
}

// importCmd brings history in from another tool. It writes through the WAL,
// so imported traffic is sessionized and counted exactly like live traffic,
// and importing the same file twice changes nothing.
func importCmd(cfg config.Config, args []string) error {
	if len(args) < 2 {
		return errors.New("usage: trckabled import <site id or domain> <file.ndjson|csv>  (use - for stdin)")
	}
	ctx := context.Background()
	ctl, err := sqlite.Open(ctx, cfg.SQLitePath())
	if err != nil {
		return err
	}
	defer ctl.Close()

	site := args[0]
	if _, ok := ctl.Site(site); !ok {
		rows, err := ctl.AllSites(ctx)
		if err != nil {
			return err
		}
		found := ""
		for _, r := range rows {
			if strings.EqualFold(r.Domain, site) {
				found = r.ID
			}
		}
		if found == "" {
			return fmt.Errorf("no site %q — add it first with: trckabled site add %s", site, site)
		}
		site = found
	}

	var in io.Reader = os.Stdin
	if args[1] != "-" {
		f, err := os.Open(args[1])
		if err != nil {
			return err
		}
		defer f.Close()
		in = f
	}

	log, err := wal.Open(cfg.WALDir(), wal.Options{})
	if errors.Is(err, wal.ErrLocked) {
		return errors.New("the server is running on this data directory: stop it, run the import, then start it again (an import writes to the same log the server does)")
	}
	if err != nil {
		return fmt.Errorf("open the write-ahead log: %w", err)
	}
	defer log.Close()

	res, err := importer.RunWith(ctx, log, site, in, "", func(done, total int) {
		if done == 0 {
			fmt.Fprintf(os.Stderr, "reading %d rows…\n", total)
			return
		}
		fmt.Fprintf(os.Stderr, "  %d of %d\n", done, total)
	})
	if err != nil {
		return err
	}
	fmt.Printf("imported %d rows (%d skipped)\n", res.Rows, res.Skipped)
	if res.Ignored > 0 {
		fmt.Printf("left out %d of GA4's own events (session_start, scroll, user_engagement…)\n", res.Ignored)
	}
	if res.Rows > 0 {
		fmt.Printf("covering %s to %s\n", res.First.Format("2006-01-02"), res.Last.Format("2006-01-02"))
	}
	// Skipping nearly everything means the file is not what the importer
	// expects, and "imported 0 rows" on its own does not say so.
	if res.Skipped > 0 && res.Rows*4 < res.Skipped {
		return fmt.Errorf("%d of %d rows had no usable timestamp or path — every row needs a time and either a path or a goal; "+
			"the columns may be named ts/path/visitor, or timestamp/url/session_id as Plausible and Umami name them; GA4 rows come from its BigQuery export", res.Skipped, res.Skipped+res.Rows)
	}
	fmt.Println("start the server and the writer will apply them")
	return nil
}
