/**
 * EchoPixel Tool System
 *
 * Cornerstone3D 스타일의 플러그인 가능한 도구 시스템
 *
 * @example
 * ```typescript
 * // 1. 도구 등록 (앱 시작 시 1회)
 * import { addTool, WindowLevelTool, PanTool, ZoomTool, StackScrollTool } from '@echopixel/core';
 *
 * addTool(WindowLevelTool);
 * addTool(PanTool);
 * addTool(ZoomTool);
 * addTool(StackScrollTool);
 *
 * // 2. 도구 그룹 생성
 * const toolGroup = ToolGroupManager.createToolGroup('myToolGroup');
 *
 * // 3. 도구 추가
 * toolGroup.addTool(WindowLevelTool.toolName);
 * toolGroup.addTool(PanTool.toolName);
 *
 * // 4. 뷰포트 연결
 * toolGroup.addViewport(viewportId, element);
 *
 * // 5. 도구 활성화 및 바인딩
 * toolGroup.setToolActive(WindowLevelTool.toolName, {
 *   bindings: [{ mouseButton: MouseBindings.Secondary }],
 * });
 * ```
 */

// Types
export {
  MouseBindings,
  KeyboardModifiers,
  ToolModes,
  type ToolBinding,
  type NormalizedMouseEvent,
  type ToolConfiguration,
  type ToolState,
  type ToolActivationOptions,
  type ToolConstructor,
  type ITool,
} from './types';

// Base Tool
export { BaseTool } from './BaseTool';

// Tool Registry
export {
  ToolRegistry,
  addTool,
  removeTool,
  hasTool,
  getRegisteredToolNames,
} from './ToolRegistry';

// Event Normalizer
export {
  normalizeMouseEvent,
  normalizeWheelEvent,
  mouseButtonToBinding,
  getModifiers,
  getCanvasCoordinates,
  matchesBinding,
  resetContext,
  initContext,
  clearAllContexts,
} from './eventNormalizer';

// Tool Group (Phase 2)
export { ToolGroup } from './ToolGroup';

// Tool Group Manager (Phase 2)
export { ToolGroupManager } from './ToolManager';

// Manipulation Tools (Phase 3)
export {
  WindowLevelTool,
  PanTool,
  ZoomTool,
  StackScrollTool,
  type WindowLevelToolConfiguration,
  type PanToolConfiguration,
  type ZoomToolConfiguration,
  type StackScrollToolConfiguration,
} from './manipulation';

// React Integration (Phase 5)
export {
  useToolGroup,
  type UseToolGroupOptions,
  type UseToolGroupReturn,
  type ViewportManagerLike,
  type DefaultToolBindings,
} from './useToolGroup';
