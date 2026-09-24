// crashtest proves trckable's zero-loss, exactly-once ingest end to end
// against the real binary (plan §10, M0 exit test):
//
//  1. start trckabled, fire N unique events concurrently
//  2. kill it mid-load (SIGKILL = crash, or SIGTERM = redeploy)
//  3. restart, re-send every event that was not acknowledged (as the tracker's
//     retry queue does) plus duplicates of acknowledged ones
//  4. stop gracefully and check the database: every event exactly once
//
// usage: go run ./bench/crashtest -bin ./bin/trckabled [-n 20000] [-signal kill|term]
package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	_ "github.com/duckdb/duckdb-go/v2"
)

const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"

// current is the running server, killed by fail() so no orphan is left behind.
var current *exec.Cmd

// failures counts non-acknowledged responses by reason.
var (
	failMu   sync.Mutex
	failures = map[string]int{}
)

func noteFailure(reason string) {
	failMu.Lock()
	failures[reason]++
	failMu.Unlock()
}

var (
	bin     = flag.String("bin", "./bin/trckabled", "path to trckabled")
	n       = flag.Int("n", 20000, "unique events to send")
	workers = flag.Int("workers", 32, "concurrent senders")
	sig     = flag.String("signal", "kill", "kill (crash) or term (graceful redeploy)")
	killAt  = flag.Float64("kill-at", 0.4, "fraction of acked events after which to stop the server")
	port    = flag.Int("port", 0, "port (default: random, so parallel runs never collide)")
)

func main() {
	flag.Parse()
	if *port == 0 {
		*port = 20000 + rand.Intn(20000)
	}
	dir, err := os.MkdirTemp("", "trckable-crashtest-*")
	check(err)
	defer os.RemoveAll(dir)
	env := append(os.Environ(), "TRCKABLE_DATA_DIR="+dir, fmt.Sprintf("TRCKABLE_ADDR=127.0.0.1:%d", *port), "TRCKABLE_LOG_LEVEL=warn", "TRCKABLE_UNSAFE_SESSION_CLOSE_MS=1500")

	out, err := cmd(env, "site", "add", "example.com").Output()
	check(err)
	site := strings.TrimSpace(string(out))
	fmt.Printf("site %s, data %s, %d events, %d workers, stop with SIG%s at %.0f%%\n",
		site, dir, *n, *workers, strings.ToUpper(*sig), *killAt*100)

	acked := make([]atomic.Bool, *n+1)
	var ackedCount atomic.Int64

	// Round 1: send until killAt, then stop the server abruptly.
	srv := start(env)
	stopped := make(chan struct{})
	sendDone := make(chan struct{})
	go func() {
		for ackedCount.Load() < int64(float64(*n)**killAt) {
			select {
			case <-sendDone: // everything sent before the threshold: stop now
				goto stop
			case <-time.After(time.Millisecond):
			}
		}
	stop:
		if *sig == "term" {
			srv.Process.Signal(syscall.SIGTERM)
			waitExit(srv, 40*time.Second)
		} else {
			srv.Process.Kill()
			srv.Wait()
		}
		close(stopped)
	}()
	ids := make([]int, *n)
	for i := range ids {
		ids[i] = i + 1
	}
	send(site, ids, acked, &ackedCount, stopped)
	close(sendDone)
	<-stopped
	fmt.Printf("round 1: server stopped with %d/%d events acknowledged\n", ackedCount.Load(), *n)

	// Round 2: restart; retry everything unacknowledged + duplicate 10% of acked.
	srv = start(env)
	var retry []int
	dups := 0
	for i := 1; i <= *n; i++ {
		if !acked[i].Load() {
			retry = append(retry, i)
		} else if rand.Intn(10) == 0 {
			retry = append(retry, i)
			dups++
		}
	}
	rand.Shuffle(len(retry), func(i, j int) { retry[i], retry[j] = retry[j], retry[i] })
	send(site, retry, acked, &ackedCount, nil)
	fmt.Printf("round 2: re-sent %d events (%d deliberate duplicates)\n", len(retry), dups)
	for pass := 1; ; pass++ {
		var missing []int
		for i := 1; i <= *n; i++ {
			if !acked[i].Load() {
				missing = append(missing, i)
			}
		}
		if len(missing) == 0 {
			break
		}
		if pass > 5 {
			fail("%d events never acknowledged after %d retry passes (first: %d)", len(missing), pass-1, missing[0])
		}
		fmt.Printf("round 2: retry pass %d for %d unacknowledged events\n", pass, len(missing))
		send(site, missing, acked, &ackedCount, nil)
	}
	failMu.Lock()
	fmt.Printf("non-acknowledged responses seen (all rounds): %v\n", failures)
	failMu.Unlock()
	waitDrained()
	time.Sleep(4 * time.Second) // every session goes idle and is written
	srv.Process.Signal(syscall.SIGTERM)
	waitExit(srv, 40*time.Second)

	// Verify directly in DuckDB.
	db, err := sql.Open("duckdb", filepath.Join(dir, "trckable.duckdb")+"?access_mode=read_only")
	check(err)
	defer db.Close()
	var rows, distinct, minID, maxID int64
	check(db.QueryRow(`SELECT count(*), count(DISTINCT event_id), min(event_id), max(event_id) FROM events`).
		Scan(&rows, &distinct, &minID, &maxID))
	fmt.Printf("database: %d rows, %d distinct event ids (range %d..%d)\n", rows, distinct, minID, maxID)
	if rows != int64(*n) || distinct != int64(*n) || minID != 1 || maxID != int64(*n) {
		fail("expected exactly %d events, each once", *n)
	}
	var sessRows, sessDistinct, evSessions, pvsSum, evPvs int64
	check(db.QueryRow(`SELECT count(*), count(DISTINCT session_id), coalesce(sum(pvs), 0) FROM sessions`).Scan(&sessRows, &sessDistinct, &pvsSum))
	check(db.QueryRow(`SELECT count(DISTINCT session_id), count(*) FILTER (kind = 1) FROM events`).Scan(&evSessions, &evPvs))
	fmt.Printf("sessions: %d rows, %d distinct, %d pageviews (events: %d sessions, %d pageviews)\n", sessRows, sessDistinct, pvsSum, evSessions, evPvs)
	if sessRows != sessDistinct || sessRows != evSessions || pvsSum != evPvs {
		fail("sessions rollup does not match events exactly once")
	}
	fmt.Println("PASS: zero loss, zero duplicates, every session rolled up exactly once")
}

func send(site string, ids []int, acked []atomic.Bool, count *atomic.Int64, stop <-chan struct{}) {
	// Reuse connections like a browser does; the default keeps only 2 idle
	// connections per host, which exhausts ephemeral ports under load.
	client := &http.Client{Timeout: 5 * time.Second, Transport: &http.Transport{
		MaxIdleConns:        *workers * 2,
		MaxIdleConnsPerHost: *workers * 2,
		IdleConnTimeout:     30 * time.Second,
	}}
	var wg sync.WaitGroup
	work := make(chan int)
	for w := 0; w < *workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for id := range work {
				body, _ := json.Marshal(map[string]any{
					"s": site, "k": "pv", "u": fmt.Sprintf("https://example.com/p/%d", id%500),
					"r": "https://news.ycombinator.com/", "w": 1440, "l": "en-US",
					"id": strconv.FormatUint(uint64(id), 36),
					"v":  strconv.FormatUint(uint64(id%3000+1), 36) + "." + strconv.FormatInt(time.Now().Unix()-86400, 36),
				})
				req, _ := http.NewRequest(http.MethodPost, fmt.Sprintf("http://127.0.0.1:%d/api/e", *port), bytes.NewReader(body))
				req.Header.Set("User-Agent", ua)
				req.Header.Set("Content-Type", "text/plain")
				resp, err := client.Do(req)
				if err != nil {
					noteFailure("net: " + errKind(err))
					continue // not acknowledged: retried later, like the tracker queue
				}
				io.Copy(io.Discard, resp.Body) // drain so the connection is reused
				resp.Body.Close()
				if resp.StatusCode == http.StatusAccepted {
					if !acked[id].Swap(true) {
						count.Add(1)
					}
				} else {
					noteFailure(fmt.Sprintf("http %d", resp.StatusCode))
				}
			}
		}()
	}
feed:
	for _, id := range ids {
		select {
		case work <- id:
		case <-stop:
			break feed
		}
	}
	close(work)
	wg.Wait()
}

func start(env []string) *exec.Cmd {
	c := cmd(env, "serve")
	c.Stdout, c.Stderr = os.Stdout, os.Stderr
	check(c.Start())
	current = c
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		if resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/readyz", *port)); err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				return c
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	fail("server did not become ready")
	return nil
}

// waitDrained waits until the writer has applied everything in the WAL.
func waitDrained() {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	for ctx.Err() == nil {
		resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/readyz", *port))
		if err == nil {
			var rd struct {
				Ready bool   `json:"analytics_ready"`
				Lag   uint64 `json:"wal_lag"`
			}
			json.NewDecoder(resp.Body).Decode(&rd)
			resp.Body.Close()
			if rd.Ready && rd.Lag == 0 {
				return
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	fail("writer did not drain")
}

// waitExit waits for a graceful exit; on timeout it dumps goroutines and fails.
func waitExit(c *exec.Cmd, d time.Duration) {
	done := make(chan error, 1)
	go func() { done <- c.Wait() }()
	select {
	case <-done:
	case <-time.After(d):
		c.Process.Signal(syscall.SIGQUIT) // Go prints all goroutine stacks
		<-done
		fail("server did not exit within %s after SIGTERM (goroutine dump above)", d)
	}
}

func cmd(env []string, args ...string) *exec.Cmd {
	c := exec.Command(*bin, args...)
	c.Env = env
	return c
}

func check(err error) {
	if err != nil {
		fail("%v", err)
	}
}

func fail(f string, a ...any) {
	fmt.Printf("FAIL: "+f+"\n", a...)
	failMu.Lock()
	fmt.Printf("non-acknowledged responses: %v\n", failures)
	failMu.Unlock()
	if current != nil && current.ProcessState == nil {
		current.Process.Kill() // never leave an orphaned server holding our pipes
	}
	os.Exit(1)
}

func errKind(err error) string {
	s := err.Error()
	for _, k := range []string{"connection refused", "connection reset", "EOF", "timeout", "broken pipe"} {
		if strings.Contains(s, k) {
			return k
		}
	}
	return s
}
