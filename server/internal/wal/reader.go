package wal

import (
	"bufio"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
)

// Record is one entry read back from the log.
type Record struct {
	Seq     uint64
	Payload []byte
}

// Reader tails the log from a starting sequence number, in exact seq order,
// returning only committed (fsynced) records. It is used by the single writer.
type Reader struct {
	l       *Log
	next    uint64 // next seq to return
	segs    []uint64
	segIdx  int
	f       *os.File
	r       *bufio.Reader
	pending []Record
}

// NewReader returns a reader positioned at the first record with seq >= from.
func (l *Log) NewReader(from uint64) (*Reader, error) {
	if from == 0 {
		from = 1
	}
	rd := &Reader{l: l, next: from}
	if err := rd.openSegmentFor(from); err != nil {
		return nil, err
	}
	return rd, nil
}

func (rd *Reader) openSegmentFor(seq uint64) error {
	segs, err := rd.l.segments()
	if err != nil {
		return err
	}
	rd.segs = segs
	idx := -1
	for i, s := range segs {
		if s <= seq {
			idx = i
		}
	}
	if idx < 0 {
		if len(segs) == 0 {
			return errors.New("wal: no segments")
		}
		// Requested seq was pruned; start at the oldest available.
		idx = 0
		if segs[0] > rd.next {
			rd.next = segs[0]
		}
	}
	return rd.openIdx(idx)
}

func (rd *Reader) openIdx(idx int) error {
	if rd.f != nil {
		rd.f.Close()
	}
	f, err := os.Open(filepath.Join(rd.l.dir, segName(rd.segs[idx])))
	if err != nil {
		return err
	}
	rd.f, rd.segIdx = f, idx
	rd.r = bufio.NewReaderSize(f, 1<<20)
	return nil
}

// Next returns up to max committed records, blocking until at least one is
// available or ctx is done.
func (rd *Reader) Next(ctx context.Context, max int) ([]Record, error) {
	for {
		recs, err := rd.TryRead(max)
		if err != nil || len(recs) > 0 {
			return recs, err
		}
		_, wait := rd.l.Committed()
		// Re-check after grabbing the notify channel to avoid a lost wakeup.
		if recs, err = rd.TryRead(max); err != nil || len(recs) > 0 {
			return recs, err
		}
		select {
		case <-wait:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
}

// TryRead returns committed records without blocking.
func (rd *Reader) TryRead(max int) ([]Record, error) {
	committed, _ := rd.l.Committed()
	var out []Record
	for len(out) < max && rd.next <= committed {
		off, _ := rd.f.Seek(0, io.SeekCurrent)
		buffered := int64(rd.r.Buffered())
		seq, payload, _, err := readRecord(rd.r)
		if err != nil {
			// End of this segment: move to the next one if it exists.
			if rd.segIdx+1 < len(rd.segs) || rd.refreshSegments() {
				if rd.segIdx+1 < len(rd.segs) {
					if err := rd.openIdx(rd.segIdx + 1); err != nil {
						return out, err
					}
					continue
				}
			}
			// Not yet flushed to the file we hold: rewind and retry later.
			if _, serr := rd.f.Seek(off-buffered, io.SeekStart); serr != nil {
				return out, serr
			}
			rd.r.Reset(rd.f)
			return out, nil
		}
		if seq < rd.next {
			continue // skip records before the requested start
		}
		if seq != rd.next {
			return out, errors.New("wal: sequence gap")
		}
		out = append(out, Record{Seq: seq, Payload: payload})
		rd.next++
	}
	return out, nil
}

func (rd *Reader) refreshSegments() bool {
	segs, err := rd.l.segments()
	if err != nil || len(segs) == len(rd.segs) {
		return false
	}
	rd.segs = segs
	return true
}

// Close releases the reader's file handle.
func (rd *Reader) Close() error {
	if rd.f != nil {
		return rd.f.Close()
	}
	return nil
}
