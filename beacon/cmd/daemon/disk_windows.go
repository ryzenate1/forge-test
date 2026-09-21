//go:build windows

package main

import (
	"path/filepath"

	"golang.org/x/sys/windows"
)

func readDiskCapacity(dataDir string) (availableGB, totalGB uint64, err error) {
	cleanPath := "C:\\"
	if dataDir != "" {
		vol := filepath.VolumeName(dataDir)
		if vol != "" {
			cleanPath = vol + "\\"
		}
	}
	pathPtr, err := windows.UTF16PtrFromString(cleanPath)
	if err != nil {
		return 0, 0, err
	}
	var freeBytes, totalBytes, totalFreeBytes uint64
	if err := windows.GetDiskFreeSpaceEx(pathPtr, &freeBytes, &totalBytes, &totalFreeBytes); err != nil {
		return 0, 0, err
	}
	return freeBytes / (1024 * 1024 * 1024), totalBytes / (1024 * 1024 * 1024), nil
}

func readDiskMB(dataDir string) int64 {
	if dataDir == "" {
		return 0
	}
	cleanPath := "C:\\"
	vol := filepath.VolumeName(dataDir)
	if vol != "" {
		cleanPath = vol + "\\"
	}
	pathPtr, err := windows.UTF16PtrFromString(cleanPath)
	if err != nil {
		return 0
	}
	var freeBytes, totalBytes, totalFreeBytes uint64
	if err := windows.GetDiskFreeSpaceEx(pathPtr, &freeBytes, &totalBytes, &totalFreeBytes); err != nil {
		return 0
	}
	return int64(freeBytes / (1024 * 1024))
}
