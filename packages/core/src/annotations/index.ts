/**
 * @echopixel/core - Annotations Module
 *
 * 측정 도구 및 어노테이션 시스템
 *
 * 설계 원칙:
 * - 유연성: 플러그인 기반 확장 가능한 구조
 * - 커스터마이징: 설정 기반 권한/제한 시스템
 * - 성능: 최적화된 렌더링 및 메모리 관리
 * - 안정성: 명확한 책임 분리
 *
 * 책임 범위:
 * - EchoPixel: 어노테이션 CRUD, Export/Import, 렌더링
 * - 앱: 서버 API 통신, 동기화, 오프라인 지원
 *
 * @packageDocumentation
 */

// Types
export * from './types';

// Coordinate system
export * from './coordinates';

// Store
export { AnnotationStore } from './AnnotationStore';
export type {
  AnnotationStoreOptions,
  CreateAnnotationInput,
  UpdateAnnotationInput,
  QueryOptions,
} from './AnnotationStore';

// Export/Import
export { Exporter, exporter } from './Exporter';
export type { ExportOptions } from './Exporter';
export { Importer, importer } from './Importer';
export type { ImportResult } from './Importer';

// History
export { HistoryManager } from './HistoryManager';
export type { HistoryManagerOptions } from './HistoryManager';

// Tools (Phase 3b)
export * from './tools';

// Renderers (Phase 3c)
export * from './renderers';

// Utils
// export * from './utils';

// TODO: Phase 3 - 추가 구현 예정
// export { AnnotationManager } from './AnnotationManager';
// export { PluginRegistry } from './PluginRegistry';
