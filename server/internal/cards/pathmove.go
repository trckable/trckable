package cards

import (
	"strconv"
	"strings"
)

// What each number of a path command is: an x, a y, a length that only scales, or something that is left alone (an
// arc's angle and flags).
const (
	pX = 'x'
	pY = 'y'
	pL = 'l'
	pN = 'n'
)

var pathArgs = map[byte]string{
	'm': "xy", 'l': "xy", 't': "xy", 'h': "x", 'v': "y",
	'c': "xyxyxy", 's': "xyxy", 'q': "xyxy", 'a': "llnnnxy", 'z': "",
}

// movePath scales an SVG path by sc and moves its origin to (x, y): an absolute command's points are scaled and
// moved, a relative one's only scaled, an arc's radii scaled and its angle and flags kept. The card's rasteriser does
// not take a transform on a path, so a mark is moved here.
func movePath(d string, x, y, sc float64) string {
	var out strings.Builder
	var cmd byte
	var nums []float64
	moved := false
	flush := func() {
		args := pathArgs[cmd|0x20]
		if cmd == 0 || len(args) == 0 {
			if cmd != 0 {
				out.WriteByte(cmd)
			}
			return
		}
		abs := cmd < 'a'
		out.WriteByte(cmd)
		for i, v := range nums[:len(nums)/len(args)*len(args)] {
			// A path's first move is from the origin, so a lowercase one is absolute too.
			at := abs || (cmd == 'm' && !moved && i < 2)
			switch args[i%len(args)] {
			case pX:
				v *= sc
				if at {
					v += x
				}
			case pY:
				v *= sc
				if at {
					v += y
				}
			case pL:
				v *= sc
			}
			if i > 0 {
				out.WriteByte(' ')
			}
			out.WriteString(strconv.FormatFloat(v, 'f', 3, 64))
		}
		nums, moved = nums[:0], true
	}
	for i := 0; i < len(d); {
		c := d[i]
		switch {
		case c == ' ' || c == ',':
			i++
		case c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z':
			flush()
			cmd = c
			i++
		default:
			j := numberEnd(d, i)
			// An arc's two flags are a digit each, even when the next number follows without a space.
			if cmd|0x20 == 'a' && (len(nums)%7 == 3 || len(nums)%7 == 4) {
				j = i + 1
			}
			v, _ := strconv.ParseFloat(d[i:j], 64)
			nums = append(nums, v)
			i = j
		}
	}
	flush()
	return out.String()
}

// numberEnd is where the number that starts at d[i] ends: a sign or a second point starts the next one.
func numberEnd(d string, i int) int {
	j, dot := i, false
	if d[j] == '-' || d[j] == '+' {
		j++
	}
	for ; j < len(d); j++ {
		switch {
		case d[j] >= '0' && d[j] <= '9':
		case d[j] == '.' && !dot:
			dot = true
		default:
			return j
		}
	}
	return j
}
