/**
 * Demo App 타입 정의
 */

import type {
  DicomDataset,
  DicomImageInfo,
  PixelDataInfo,
  DicomInstanceId,
  DicomMetadata,
  Annotation,
} from '@echopixel/core';
import type {
  HybridSeriesData,
  ViewerData,
  PerformanceOptions,
} from '@echopixel/react';

// 뷰 모드 타입
export type ViewMode = 'single' | 'multi' | 'multi-canvas' | 'perf-test';

// 데이터 소스 모드
export type DataSourceMode = 'local' | 'wado-rs';

// DICOM 파싱 결과
export interface ParseResult {
  isValid: boolean;
  dataset?: DicomDataset;
  imageInfo?: DicomImageInfo;
  pixelData?: PixelDataInfo;
  error?: string;
  tagCount?: number;
}

// Instance UID 스캔 결과
export interface ScannedInstance {
  uid: string;
  frameCount: number;
  width: number;
  height: number;
  isPlayable: boolean; // frameCount > 1
  isEncapsulated: boolean;
  error?: string;
}

// WADO-RS 설정
export interface WadoConfig {
  baseUrl: string;
  studyUid: string;
  seriesUid: string;
  instanceUid: string;
}

// 뷰포트 데이터 (로컬 모드용)
export interface ViewportData {
  frames: Uint8Array[];
  imageInfo: DicomImageInfo;
  isEncapsulated: boolean;
}

// 멀티 뷰포트 통계
export interface MultiViewportStats {
  fps: number;
  frameTime: number;
  vramMB: number;
}

// 그리드 차원
export interface GridDimensions {
  rows: number;
  cols: number;
}

// 뷰포트 개수로 그리드 차원 계산
export function calculateGridDimensions(count: number): GridDimensions {
  if (count <= 0) return { rows: 1, cols: 1 };
  if (count === 1) return { rows: 1, cols: 1 };
  if (count === 2) return { rows: 1, cols: 2 };
  if (count <= 4) return { rows: 2, cols: 2 };
  // 5개 이상: 가로 4개 제한
  const cols = 4;
  const rows = Math.ceil(count / cols);
  return { rows, cols };
}

// Re-export for convenience
export type {
  DicomDataset,
  DicomImageInfo,
  PixelDataInfo,
  DicomInstanceId,
  DicomMetadata,
  Annotation,
  HybridSeriesData,
  ViewerData,
  PerformanceOptions,
};
