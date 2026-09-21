//go:build !windows

package main

import (
	"log"

	"golang.org/x/sys/unix"
)

func readDiskCapacity(dataDir string) (availableGB, totalGB uint64, err error) {
	var stat unix.Statfs_t
	if err := unix.Statfs(dataDir, &stat); err != nil {
		return 0, 0, err
	}
	availableGB = stat.Bavail * uint64(stat.Bsize) / (1024 * 1024 * 1024)
	totalGB = stat.Blocks * uint64(stat.Bsize) / (1024 * 1024 * 1024)
	return availableGB, totalGB, nil
}

func readDiskMB(dataDir string) int64 {
	if dataDir == "" {
		return 0
	}
	var stat unix.Statfs_t
	if err := unix.Statfs(dataDir, &stat); err != nil {
		log.Printf("read disk capacity for %s failed: %v", dataDir, err)
		return 0
	}
	bytes := uint64(stat.Bavail) * uint64(stat.Bsize)
	return int64(bytes / (1024 * 1024))
}
