package summary

import "github.com/trckable/trckable/server/internal/say"

// The words of a period's numbers live in package say (a leaf, so mail and
// the stores can use them); they are re-exported here so one import says them.
type (
	Words = say.Words
	Move  = say.Move
)

var (
	For   = say.For
	Delta = say.Delta
	Langs = say.Langs
)

// FlatBelow is the size of a change, in percent, under which a number is said to be about the same.
const FlatBelow = say.FlatBelow
