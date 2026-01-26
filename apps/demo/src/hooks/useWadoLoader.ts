/**
 * WADO-RS 데이터 로드 훅
 * - 단일/다중 Instance 로드
 * - 캘리브레이션 폴백 (full DICOM instance에서 추출)
 */

import { useState, useCallback } from 'react';
import {
  WadoRsDataSource,
  getUltrasoundCalibration,
  type DicomInstanceId,
  type DicomImageInfo,
} from '@echopixel/core';
import type { WadoConfig, ViewportData, HybridSeriesData, ViewerData } from '../types/demo';

interface _LoadedData {
  frames: Uint8Array[];
  imageInfo: DicomImageInfo;
  isEncapsulated: boolean;
  frameCount: number;
}
// Note: _LoadedData is currently unused but kept for future use

interface UseWadoLoaderReturn {
  loadInstance: (config: WadoConfig) => Promise<ViewportData | null>;
  loadMultipleInstances: (
    config: WadoConfig,
    instanceUids: string[],
    onProgress?: (current: number, total: number, uid: string) => void
  ) => Promise<Map<string, HybridSeriesData>>;
  loadMultipleAsViewerData: (
    config: WadoConfig,
    instanceUids: string[],
    onProgress?: (current: number, total: number, uid: string) => void
  ) => Promise<ViewerData[]>;
  loadingStatus: string;
  error: string | null;
}

export function useWadoLoader(): UseWadoLoaderReturn {
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // 캘리브레이션 폴백 로직
  const fetchCalibrationFromFullInstance = async (
    baseUrl: string,
    instanceId: DicomInstanceId
  ): Promise<DicomImageInfo | null> => {
    try {
      const instanceUrl = `${baseUrl}/studies/${instanceId.studyInstanceUid}/series/${instanceId.seriesInstanceUid}/instances/${instanceId.sopInstanceUid}`;
      const response = await fetch(instanceUrl, {
        headers: {
          Accept: 'application/dicom',
        },
      });

      if (response.ok) {
        const buffer = await response.arrayBuffer();
        const ultrasoundCalibration = getUltrasoundCalibration(buffer);
        if (ultrasoundCalibration) {
          return { ultrasoundCalibration } as DicomImageInfo;
        }
      }
    } catch (err) {
      console.warn('[useWadoLoader] Failed to fetch calibration from full instance:', err);
    }
    return null;
  };

  // 단일 Instance 로드
  const loadInstance = useCallback(async (config: WadoConfig): Promise<ViewportData | null> => {
    if (!config.studyUid || !config.seriesUid || !config.instanceUid) {
      setError('Study UID, Series UID, Instance UID를 모두 입력하세요');
      return null;
    }

    setError(null);
    setLoadingStatus('Loading from WADO-RS...');

    try {
      const dataSource = new WadoRsDataSource({
        baseUrl: config.baseUrl,
        timeout: 60000,
        maxRetries: 3,
      });

      const instanceId: DicomInstanceId = {
        studyInstanceUid: config.studyUid,
        seriesInstanceUid: config.seriesUid,
        sopInstanceUid: config.instanceUid,
      };

      setLoadingStatus('Fetching frames...');
      const { metadata, frames } = await dataSource.loadAllFrames(instanceId);

      // calibration 폴백
      let finalImageInfo = metadata.imageInfo;
      if (!finalImageInfo.pixelSpacing && !finalImageInfo.ultrasoundCalibration) {
        setLoadingStatus('Fetching calibration data...');
        const calibrationInfo = await fetchCalibrationFromFullInstance(config.baseUrl, instanceId);
        if (calibrationInfo?.ultrasoundCalibration) {
          console.log('[useWadoLoader] Extracted ultrasoundCalibration from full instance');
          finalImageInfo = {
            ...finalImageInfo,
            ultrasoundCalibration: calibrationInfo.ultrasoundCalibration,
          };
        }
      }

      setLoadingStatus('');
      return {
        frames,
        imageInfo: finalImageInfo,
        isEncapsulated: metadata.isEncapsulated,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`WADO-RS load error: ${errorMessage}`);
      setLoadingStatus('');
      return null;
    }
  }, []);

  // 다중 Instance 로드 (HybridSeriesData 형식)
  const loadMultipleInstances = useCallback(
    async (
      config: WadoConfig,
      instanceUids: string[],
      onProgress?: (current: number, total: number, uid: string) => void
    ): Promise<Map<string, HybridSeriesData>> => {
      setError(null);
      setLoadingStatus('초기화 중...');

      const dataSource = new WadoRsDataSource({
        baseUrl: config.baseUrl,
        timeout: 60000,
        maxRetries: 3,
      });

      const seriesMap = new Map<string, HybridSeriesData>();

      for (let i = 0; i < instanceUids.length; i++) {
        const instanceUid = instanceUids[i];
        const viewportId = `viewport-${i}`;

        const statusMessage = `로딩 중... (${i + 1}/${instanceUids.length}) ${instanceUid.slice(-10)}`;
        setLoadingStatus(statusMessage);
        onProgress?.(i + 1, instanceUids.length, instanceUid);

        try {
          const instanceId: DicomInstanceId = {
            studyInstanceUid: config.studyUid,
            seriesInstanceUid: config.seriesUid,
            sopInstanceUid: instanceUid,
          };

          const { metadata, frames } = await dataSource.loadAllFrames(instanceId);

          // calibration 폴백
          let finalImageInfo = metadata.imageInfo;
          if (!finalImageInfo.pixelSpacing && !finalImageInfo.ultrasoundCalibration) {
            console.log(`[useWadoLoader] No calibration in metadata for viewport ${i + 1}, fetching from full instance...`);
            const calibrationInfo = await fetchCalibrationFromFullInstance(config.baseUrl, instanceId);
            if (calibrationInfo?.ultrasoundCalibration) {
              console.log(`[useWadoLoader] Extracted ultrasoundCalibration for viewport ${i + 1}`);
              finalImageInfo = {
                ...finalImageInfo,
                ultrasoundCalibration: calibrationInfo.ultrasoundCalibration,
              };
            }
          }

          seriesMap.set(viewportId, {
            info: {
              seriesId: instanceUid,
              frameCount: metadata.frameCount,
              imageWidth: finalImageInfo.columns,
              imageHeight: finalImageInfo.rows,
              isEncapsulated: metadata.isEncapsulated,
              bitsStored: finalImageInfo.bitsStored,
            },
            frames,
            imageInfo: finalImageInfo,
            isEncapsulated: metadata.isEncapsulated,
          });
        } catch (err) {
          console.error(`[useWadoLoader] Failed to load ${instanceUid}:`, err);
        }
      }

      setLoadingStatus('');
      return seriesMap;
    },
    []
  );

  // 다중 Instance 로드 (ViewerData 형식 - Multi Canvas 모드용)
  const loadMultipleAsViewerData = useCallback(
    async (
      config: WadoConfig,
      instanceUids: string[],
      onProgress?: (current: number, total: number, uid: string) => void
    ): Promise<ViewerData[]> => {
      setError(null);
      setLoadingStatus('초기화 중...');

      const dataSource = new WadoRsDataSource({
        baseUrl: config.baseUrl,
        timeout: 60000,
        maxRetries: 3,
      });

      const viewers: ViewerData[] = [];

      for (let i = 0; i < instanceUids.length; i++) {
        const instanceUid = instanceUids[i];

        const statusMessage = `로딩 중... (${i + 1}/${instanceUids.length})`;
        setLoadingStatus(statusMessage);
        onProgress?.(i + 1, instanceUids.length, instanceUid);

        try {
          const instanceId: DicomInstanceId = {
            studyInstanceUid: config.studyUid,
            seriesInstanceUid: config.seriesUid,
            sopInstanceUid: instanceUid,
          };

          const { metadata, frames } = await dataSource.loadAllFrames(instanceId);

          // calibration 폴백
          let finalImageInfo = metadata.imageInfo;
          if (!finalImageInfo.pixelSpacing && !finalImageInfo.ultrasoundCalibration) {
            const calibrationInfo = await fetchCalibrationFromFullInstance(config.baseUrl, instanceId);
            if (calibrationInfo?.ultrasoundCalibration) {
              console.log(`[useWadoLoader] Extracted ultrasoundCalibration for viewer ${i + 1}`);
              finalImageInfo = {
                ...finalImageInfo,
                ultrasoundCalibration: calibrationInfo.ultrasoundCalibration,
              };
            }
          }

          viewers.push({
            id: `viewer-${i}`,
            frames,
            imageInfo: finalImageInfo,
            isEncapsulated: metadata.isEncapsulated,
            label: `#${i + 1} (${metadata.frameCount}f)`,
          });

          console.log(`[useWadoLoader] Loaded ${frames.length} frames for viewer ${i + 1}`);
        } catch (err) {
          console.error(`[useWadoLoader] Failed to load ${instanceUid}:`, err);
        }
      }

      setLoadingStatus('');
      return viewers;
    },
    []
  );

  return {
    loadInstance,
    loadMultipleInstances,
    loadMultipleAsViewerData,
    loadingStatus,
    error,
  };
}
