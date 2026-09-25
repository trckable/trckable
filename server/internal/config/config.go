// Package config reads trckable's settings from TRCKABLE_* environment
// variables. Nothing is required: every value has a safe default, so a fresh
// container starts with zero configuration.
package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Config is the resolved runtime configuration.
type Config struct {
	DataDir      string   // TRCKABLE_DATA_DIR (default /data in the container, ./data otherwise)
	Addr         string   // TRCKABLE_ADDR, or ":"+PORT (Railway), default ":8080"
	DuckThreads  int      // TRCKABLE_DUCKDB_THREADS (default 2)
	DuckMemory   string   // TRCKABLE_DUCKDB_MEMORY (default "256MB")
	TrustProxy   string   // TRCKABLE_TRUST_PROXY: "auto" | "none" | "xff" | "header:<Name>"
	LogLevel     string   // TRCKABLE_LOG_LEVEL: debug | info | warn | error
	WALNoSync    bool     // TRCKABLE_UNSAFE_NO_FSYNC=1 — benchmarks only, never production
	OnRailway    bool     // detected from RAILWAY_* variables
	DrainSeconds int      // TRCKABLE_DRAIN_SECONDS (default 25; Railway drains for 30)
	Sites        []string // TRCKABLE_SITES: domains to create at boot (comma-separated)
	Geo          string   // TRCKABLE_GEO: country (default, ~4 MB) | city (~130 MB) | off
	GeoShared    string   // TRCKABLE_GEO_DIR: a shared, read-only geo directory kept fresh elsewhere
	APIToken     string   // TRCKABLE_API_TOKEN: automation bearer token for /api/v1
	SetupToken   string   // TRCKABLE_SETUP_TOKEN: first-run setup secret (Railway template generates it)
	BaseURL      string   // TRCKABLE_BASE_URL, or https://$RAILWAY_PUBLIC_DOMAIN
	Secret       string   // TRCKABLE_SECRET: encrypts provider keys (else data/secret.key)
	SMTPURL      string   // TRCKABLE_SMTP_URL: smtp://user:pass@host:587, for alerts by email (optional)
	MailFrom     string   // TRCKABLE_MAIL_FROM: the sender address for those emails
	// OperatorToken lets whoever runs the machine read /_trckable/usage
	// (TRCKABLE_OPERATOR_TOKEN or _FILE). Empty: that endpoint does not exist.
	OperatorToken string
	// Managed is set when a hosting provider signs people in (TRCKABLE_MANAGED:
	// the provider's sign-in page, e.g. https://cloud.trckable.com/login). Then
	// there is no setup, no password sign-in, no password or two-step to set
	// here: people arrive through the provider's one-time sign-in links.
	Managed string
	// UpdateCheck: whether the dashboard may look for a newer release
	// (TRCKABLE_UPDATE_CHECK=off turns it off for everyone). The check runs
	// in the owner's browser, once a day, against GitHub's release list; the
	// server itself never calls out.
	UpdateCheck bool
	BackupS3    string // TRCKABLE_BACKUP_S3: https://key:secret@host/bucket/prefix?region=… (optional)
	BackupDays  int    // TRCKABLE_BACKUP_KEEP_DAYS: how long off-site copies are kept (default 30)
	// TRCKABLE_UNSAFE_SESSION_CLOSE_MS shortens how long sessions stay open
	// before they are written. Tests only: never in production.
	SessionCloseAfter time.Duration
}

// Load resolves the configuration from the environment.
func Load() Config {
	c := Config{
		DataDir:       env("TRCKABLE_DATA_DIR", defaultDataDir()),
		Addr:          env("TRCKABLE_ADDR", ""),
		DuckThreads:   envInt("TRCKABLE_DUCKDB_THREADS", 2),
		DuckMemory:    env("TRCKABLE_DUCKDB_MEMORY", "256MB"),
		TrustProxy:    env("TRCKABLE_TRUST_PROXY", "auto"),
		LogLevel:      strings.ToLower(env("TRCKABLE_LOG_LEVEL", "info")),
		WALNoSync:     os.Getenv("TRCKABLE_UNSAFE_NO_FSYNC") == "1",
		OnRailway:     os.Getenv("RAILWAY_ENVIRONMENT") != "" || os.Getenv("RAILWAY_PROJECT_ID") != "",
		DrainSeconds:  envInt("TRCKABLE_DRAIN_SECONDS", 25),
		Geo:           strings.ToLower(env("TRCKABLE_GEO", "country")),
		GeoShared:     os.Getenv("TRCKABLE_GEO_DIR"),
		APIToken:      envFile("TRCKABLE_API_TOKEN"),
		SetupToken:    envFile("TRCKABLE_SETUP_TOKEN"),
		BaseURL:       os.Getenv("TRCKABLE_BASE_URL"),
		Secret:        envFile("TRCKABLE_SECRET"),
		SMTPURL:       os.Getenv("TRCKABLE_SMTP_URL"),
		MailFrom:      os.Getenv("TRCKABLE_MAIL_FROM"),
		BackupS3:      envFile("TRCKABLE_BACKUP_S3"),
		OperatorToken: envFile("TRCKABLE_OPERATOR_TOKEN"),
		Managed:       strings.TrimSpace(os.Getenv("TRCKABLE_MANAGED")),
		UpdateCheck:   !strings.EqualFold(strings.TrimSpace(os.Getenv("TRCKABLE_UPDATE_CHECK")), "off"),
		BackupDays:    envInt("TRCKABLE_BACKUP_KEEP_DAYS", 30),
	}
	if c.BaseURL == "" && os.Getenv("RAILWAY_PUBLIC_DOMAIN") != "" {
		c.BaseURL = "https://" + os.Getenv("RAILWAY_PUBLIC_DOMAIN")
	}
	if ms := envInt("TRCKABLE_UNSAFE_SESSION_CLOSE_MS", 0); ms > 0 {
		c.SessionCloseAfter = time.Duration(ms) * time.Millisecond
	}
	for _, d := range strings.Split(os.Getenv("TRCKABLE_SITES"), ",") {
		if d = strings.TrimSpace(d); d != "" {
			c.Sites = append(c.Sites, d)
		}
	}
	if c.Addr == "" {
		if port := os.Getenv("PORT"); port != "" {
			c.Addr = ":" + port
		} else {
			c.Addr = ":8080"
		}
	}
	return c
}

// Paths inside the data directory.
func (c Config) SQLitePath() string { return filepath.Join(c.DataDir, "trckable.db") }
func (c Config) DuckPath() string   { return filepath.Join(c.DataDir, "trckable.duckdb") }
func (c Config) WALDir() string     { return filepath.Join(c.DataDir, "wal") }

// GeoDir is where the geo databases live: inside the data directory, or a
// shared directory (TRCKABLE_GEO_DIR) that many instances read.
func (c Config) GeoDir() string {
	if c.GeoShared != "" {
		return c.GeoShared
	}
	return filepath.Join(c.DataDir, "geo")
}

func defaultDataDir() string {
	if st, err := os.Stat("/data"); err == nil && st.IsDir() {
		return "/data"
	}
	return "./data"
}

// envFile reads a secret from k, or from the file named by k_FILE: systemd
// credentials, Docker and Kubernetes secrets hand secrets over as files, and a
// file is not visible in the process environment or `systemctl show`.
func envFile(k string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	if p := os.Getenv(k + "_FILE"); p != "" {
		b, err := os.ReadFile(p)
		if err != nil {
			// Named but unreadable is an error, never an empty value: an empty
			// TRCKABLE_SECRET would quietly mint a new key.
			fileErrs = append(fileErrs, fmt.Errorf("%s_FILE: %w", k, err))
			return ""
		}
		return strings.TrimSpace(string(b))
	}
	return ""
}

var fileErrs []error

// Check reports settings that were named but could not be read. The server
// refuses to start on them.
func (c Config) Check() error { return errors.Join(fileErrs...) }

func env(k, def string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return def
}

func envInt(k string, def int) int {
	if v, err := strconv.Atoi(os.Getenv(k)); err == nil && v > 0 {
		return v
	}
	return def
}
