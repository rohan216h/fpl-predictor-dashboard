package dashboarddata

import (
	_ "embed"
)

//go:embed overview.json
var OverviewJSON []byte

//go:embed squad.json
var SquadJSON []byte

//go:embed transfers.json
var TransfersJSON []byte

//go:embed captaincy.json
var CaptaincyJSON []byte

//go:embed chips.json
var ChipsJSON []byte

//go:embed players.json
var PlayersJSON []byte

//go:embed validation.json
var ValidationJSON []byte

var fileMap = map[string][]byte{
	"overview.json":   OverviewJSON,
	"squad.json":      SquadJSON,
	"transfers.json":  TransfersJSON,
	"captaincy.json":  CaptaincyJSON,
	"chips.json":      ChipsJSON,
	"players.json":    PlayersJSON,
	"validation.json": ValidationJSON,
}

// Get returns the embedded bytes for the given JSON file if available.
func Get(filename string) ([]byte, bool) {
	b, ok := fileMap[filename]
	return b, ok
}

