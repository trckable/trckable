package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

const (
	duckMemoryFloor = 512 << 20
	duckMemoryCap   = 4 << 30
)

// defaultDuckMemory is the analytics database's memory limit when none is
// set: a quarter of the memory this process may use (the container's limit,
// else the machine's), never under 512 MB and never over 4 GB. A fixed
// 256 MB ran big reports out of memory.
func defaultDuckMemory() string {
	return duckMemoryFor(availableMemory())
}

func duckMemoryFor(avail int64) string {
	n := avail / 4
	n = max(duckMemoryFloor, min(n, duckMemoryCap))
	return fmt.Sprintf("%dMB", n>>20)
}

// availableMemory is the container's memory limit, else the machine's total;
// 0 when neither can be read.
func availableMemory() int64 {
	for _, f := range []string{"/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"} {
		if b, err := os.ReadFile(f); err == nil {
			// "max" (no limit) or a huge number means unlimited.
			if n, err := strconv.ParseInt(strings.TrimSpace(string(b)), 10, 64); err == nil && n > 0 && n < 1<<50 {
				return n
			}
		}
	}
	if b, err := os.ReadFile("/proc/meminfo"); err == nil {
		for _, l := range strings.Split(string(b), "\n") {
			if f := strings.Fields(l); len(f) >= 2 && f[0] == "MemTotal:" {
				if kb, err := strconv.ParseInt(f[1], 10, 64); err == nil {
					return kb << 10
				}
			}
		}
	}
	return 0
}
