/**
 * Instance 스캔 및 선택 관리 훅
 */

import { useState, useCallback } from 'react';
import { WadoRsDataSource } from '@echopixel/core';
import type { ScannedInstance, WadoConfig } from '../types/demo';

interface UseInstanceScannerReturn {
  scanInstances: (config: WadoConfig) => Promise<void>;
  scannedInstances: ScannedInstance[];
  selectedUids: Set<string>;
  toggleSelection: (uid: string) => void;
  selectAllPlayable: (maxCount: number) => void;
  clearSelection: () => void;
  setSelectedUids: (uids: Set<string>) => void;
  scanningStatus: string;
  error: string | null;
  clearError: () => void;
  reset: () => void;
}

export function useInstanceScanner(): UseInstanceScannerReturn {
  const [scannedInstances, setScannedInstances] = useState<ScannedInstance[]>([]);
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [scanningStatus, setScanningStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Instance 스캔
  const scanInstances = useCallback(async (config: WadoConfig) => {
    setScanningStatus('Instance 목록 조회 중...');
    setScannedInstances([]);
    setSelectedUids(new Set());
    setError(null);

    const dataSource = new WadoRsDataSource({
      baseUrl: config.baseUrl,
      timeout: 30000,
      maxRetries: 2,
    });

    try {
      // Series 내 모든 Instance UID 조회
      const instanceUids = await dataSource.listInstances(config.studyUid, config.seriesUid);

      if (instanceUids.length === 0) {
        setError('Series에서 Instance를 찾을 수 없습니다');
        setScanningStatus('');
        return;
      }

      console.log(`[useInstanceScanner] Found ${instanceUids.length} instances in series`);

      // 각 Instance의 메타데이터 조회
      const results: ScannedInstance[] = [];

      for (let i = 0; i < instanceUids.length; i++) {
        const uid = instanceUids[i];
        setScanningStatus(`메타데이터 조회 중... (${i + 1}/${instanceUids.length})`);

        try {
          const metadata = await dataSource.loadMetadata({
            studyInstanceUid: config.studyUid,
            seriesInstanceUid: config.seriesUid,
            sopInstanceUid: uid,
          });

          results.push({
            uid,
            frameCount: metadata.frameCount,
            width: metadata.imageInfo.columns,
            height: metadata.imageInfo.rows,
            isPlayable: metadata.frameCount > 1,
            isEncapsulated: metadata.isEncapsulated,
          });
        } catch (err) {
          results.push({
            uid,
            frameCount: 0,
            width: 0,
            height: 0,
            isPlayable: false,
            isEncapsulated: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      setScannedInstances(results);
      setScanningStatus('');

      // 첫 N개 자동 선택 (maxSelect는 나중에 적용)
      const validUids = results.filter((r) => !r.error).slice(0, 16).map((r) => r.uid);
      setSelectedUids(new Set(validUids));
    } catch (err) {
      setError(`Instance 목록 조회 실패: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setScanningStatus('');
    }
  }, []);

  // 선택 토글
  const toggleSelection = useCallback((uid: string) => {
    setSelectedUids((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(uid)) {
        newSet.delete(uid);
      } else {
        newSet.add(uid);
      }
      return newSet;
    });
  }, []);

  // 재생 가능한 것만 선택 (maxCount 제한)
  const selectAllPlayable = useCallback(
    (maxCount: number) => {
      const playableUids = scannedInstances
        .filter((r) => !r.error && r.isPlayable)
        .slice(0, maxCount)
        .map((r) => r.uid);
      setSelectedUids(new Set(playableUids));
    },
    [scannedInstances]
  );

  // 선택 해제
  const clearSelection = useCallback(() => {
    setSelectedUids(new Set());
  }, []);

  // 에러 초기화
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // 전체 초기화
  const reset = useCallback(() => {
    setScannedInstances([]);
    setSelectedUids(new Set());
    setScanningStatus('');
    setError(null);
  }, []);

  return {
    scanInstances,
    scannedInstances,
    selectedUids,
    toggleSelection,
    selectAllPlayable,
    clearSelection,
    setSelectedUids,
    scanningStatus,
    error,
    clearError,
    reset,
  };
}
