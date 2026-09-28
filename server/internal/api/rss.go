package api

import (
	"bufio"
	"os"
	"runtime"
	"strconv"
	"strings"
)

// memoryUse is the process's resident memory — everything, the analytics
// store included, since DuckDB runs inside this process. Linux (every
// container) says it in /proc; elsewhere the Go runtime's own total is the
// best there is, and the source says which one it was.
func memoryUse() (bytes uint64, source string) {
	if f, err := os.Open("/proc/self/status"); err == nil {
		defer f.Close()
		sc := bufio.NewScanner(f)
		for sc.Scan() {
			if rest, ok := strings.CutPrefix(sc.Text(), "VmRSS:"); ok {
				fields := strings.Fields(rest) // "123456 kB"
				if len(fields) > 0 {
					if kb, err := strconv.ParseUint(fields[0], 10, 64); err == nil {
						return kb * 1024, "rss"
					}
				}
			}
		}
	}
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	return m.Sys, "go"
}
