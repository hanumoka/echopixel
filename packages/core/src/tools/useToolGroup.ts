/**
 * useToolGroup - React Hook for Tool System Integration
 *
 * 학습 포인트:
 * - React useEffect 내에서 도구 그룹 생명주기 관리
 * - HybridViewportManager/ViewportManager와 연동
 * - 도구 설정에 viewport 접근자 자동 주입
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { ToolGroupManager } from './ToolManager';
import { ToolGroup } from './ToolGroup';
import { addTool, hasTool } from './ToolRegistry';
import { MouseBindings, KeyboardModifiers } from './types';
import type { ToolBinding, ToolConstructor } from './types';
import type { Viewport } from '../viewport/types';

// 도구 클래스들 (lazy import를 위해 타입만 선언)
import { WindowLevelTool } from './manipulation/WindowLevelTool';
import { PanTool } from './manipulation/PanTool';
import { ZoomTool } from './manipulation/ZoomTool';
import { StackScrollTool } from './manipulation/StackScrollTool';

/**
 * ViewportManager 인터페이스 (ViewportManager와 HybridViewportManager 공통)
 */
export interface ViewportManagerLike {
  getViewport(id: string): Viewport | null;
  setViewportWindowLevel(id: string, wl: { center: number; width: number } | null): void;
  setViewportPan(id: string, pan: { x: number; y: number }): void;
  setViewportZoom(id: string, zoom: number): void;
  setViewportFrame(id: string, frameIndex: number): void;
}

/**
 * 기본 도구 바인딩 설정
 */
export interface DefaultToolBindings {
  /** WindowLevel 바인딩 (기본: 우클릭) */
  windowLevel?: ToolBinding[];
  /** Pan 바인딩 (기본: 중클릭) */
  pan?: ToolBinding[];
  /** Zoom 바인딩 (기본: Shift+좌클릭) */
  zoom?: ToolBinding[];
  /** StackScroll 바인딩 (기본: 휠) */
  stackScroll?: ToolBinding[];
}

/**
 * useToolGroup 옵션
 */
export interface UseToolGroupOptions {
  /** 도구 그룹 ID */
  toolGroupId: string;
  /** ViewportManager 또는 HybridViewportManager */
  viewportManager: ViewportManagerLike | null;
  /** 뷰포트 ID와 DOM 요소 매핑 */
  viewportElements: Map<string, HTMLElement>;
  /** 사용할 도구 클래스들 (기본: 기본 도구들) */
  tools?: ToolConstructor[];
  /** 도구 바인딩 설정 (기본: Cornerstone3D 호환) */
  bindings?: DefaultToolBindings;
  /** 비활성화 여부 */
  disabled?: boolean;
  /**
   * 정지 이미지 모드 여부 (frameCount === 1)
   *
   * true: 휠 → Zoom, StackScroll 비활성화
   * false/undefined: 휠 → StackScroll (동영상 기본값)
   */
  isStaticImage?: boolean;
  /**
   * viewportElements 변경 감지용 키
   *
   * Map을 mutate해도 React가 감지하지 못하므로,
   * 이 값을 변경하여 뷰포트 재등록을 트리거합니다.
   */
  viewportElementsKey?: number;
}

/**
 * useToolGroup 반환 타입
 */
export interface UseToolGroupReturn {
  /** 도구 그룹 인스턴스 */
  toolGroup: ToolGroup | null;
  /** 도구 활성화 */
  setToolActive: (toolName: string, bindings: ToolBinding[]) => void;
  /** 도구 비활성화 */
  setToolDisabled: (toolName: string) => void;
  /** 모든 뷰포트 Transform 리셋 */
  resetAllViewports: () => void;
}

/**
 * 기본 바인딩 - 동영상 모드 (Cornerstone3D 호환)
 *
 * 동영상(frameCount > 1)에서 휠은 프레임 스크롤에 사용
 */
const DEFAULT_BINDINGS_VIDEO: Required<DefaultToolBindings> = {
  windowLevel: [{ mouseButton: MouseBindings.Secondary }],
  pan: [{ mouseButton: MouseBindings.Auxiliary }],
  zoom: [{ mouseButton: MouseBindings.Primary, modifierKey: KeyboardModifiers.Shift }],
  stackScroll: [{ mouseButton: MouseBindings.Wheel }],
};

/**
 * 기본 바인딩 - 정지 이미지 모드
 *
 * 정지 이미지(frameCount === 1)에서 휠은 줌에 사용
 * StackScroll은 비활성화
 */
const DEFAULT_BINDINGS_STATIC: Required<DefaultToolBindings> = {
  windowLevel: [{ mouseButton: MouseBindings.Secondary }],
  pan: [{ mouseButton: MouseBindings.Auxiliary }],
  zoom: [
    { mouseButton: MouseBindings.Primary, modifierKey: KeyboardModifiers.Shift },
    { mouseButton: MouseBindings.Wheel }, // 휠로 줌
  ],
  stackScroll: [], // 정지 이미지에서는 비활성화
};

/**
 * 기본 도구 클래스들 등록
 */
function registerDefaultTools(): void {
  const defaultTools: ToolConstructor[] = [
    WindowLevelTool,
    PanTool,
    ZoomTool,
    StackScrollTool,
  ];

  for (const ToolClass of defaultTools) {
    if (!hasTool(ToolClass.toolName)) {
      addTool(ToolClass);
    }
  }
}

/**
 * Tool System React Hook
 *
 * HybridMultiViewport 또는 MultiViewport와 함께 사용하여
 * 도구 시스템을 쉽게 통합할 수 있습니다.
 *
 * @example
 * ```tsx
 * function MyViewport() {
 *   const [viewportElements] = useState(() => new Map<string, HTMLElement>());
 *   const hybridManagerRef = useRef<HybridViewportManager | null>(null);
 *
 *   const { toolGroup, resetAllViewports } = useToolGroup({
 *     toolGroupId: 'main',
 *     viewportManager: hybridManagerRef.current,
 *     viewportElements,
 *   });
 *
 *   // ... viewport rendering
 * }
 * ```
 */
export function useToolGroup({
  toolGroupId,
  viewportManager,
  viewportElements,
  tools,
  bindings = {},
  disabled = false,
  isStaticImage = false,
  viewportElementsKey = 0,
}: UseToolGroupOptions): UseToolGroupReturn {
  // useState로 toolGroup 관리 (리렌더링 트리거용)
  const [toolGroup, setToolGroup] = useState<ToolGroup | null>(null);
  const registeredViewportsRef = useRef<Set<string>>(new Set());

  // bindings를 ref로 저장하여 의존성 배열 문제 해결
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  // 이전 isStaticImage 값 추적 (변경 감지용)
  const prevIsStaticImageRef = useRef(isStaticImage);

  // viewportManager를 ref로 저장하여 의존성 배열 문제 해결
  // (viewportManager는 매 렌더링마다 새 객체가 생성될 수 있으므로)
  const viewportManagerRef = useRef(viewportManager);
  viewportManagerRef.current = viewportManager;

  // 도구 그룹 생성/삭제
  useEffect(() => {
    if (disabled) {
      if (toolGroup) {
        ToolGroupManager.destroyToolGroup(toolGroupId);
        setToolGroup(null);
        registeredViewportsRef.current.clear();
      }
      return;
    }

    // 기본 도구 등록
    registerDefaultTools();

    // 도구 그룹 생성 또는 가져오기
    const newToolGroup = ToolGroupManager.getOrCreateToolGroup(toolGroupId);

    // 도구 추가 (tools가 지정되면 해당 도구만, 아니면 기본 도구들)
    const toolsToAdd = tools ?? [
      WindowLevelTool,
      PanTool,
      ZoomTool,
      StackScrollTool,
    ];

    // 이미 그룹에 있는 도구 목록 확인
    const existingTools = new Set(newToolGroup.getToolNames());

    for (const ToolClass of toolsToAdd) {
      // 전역 레지스트리에 없으면 등록
      if (!hasTool(ToolClass.toolName)) {
        addTool(ToolClass);
      }
      // 그룹에 없으면 추가 (중복 경고 방지)
      if (!existingTools.has(ToolClass.toolName)) {
        newToolGroup.addTool(ToolClass.toolName);
      }
    }

    setToolGroup(newToolGroup);

    return () => {
      ToolGroupManager.destroyToolGroup(toolGroupId);
      setToolGroup(null);
      registeredViewportsRef.current.clear();
    };
  }, [toolGroupId, disabled]);

  // ViewportManager와 연동하여 도구에 콜백 주입 및 활성화
  // 주의: viewportManager를 의존성에 넣으면 매 렌더링마다 재실행되므로 ref 사용
  useEffect(() => {
    if (!toolGroup || disabled) return;

    // 도구 설정에 ViewportManager 콜백 주입
    // 콜백 내에서 viewportManagerRef.current를 사용하여 항상 최신 값 참조
    // 주의: WindowLevelTool은 정규화된 값(0~1)을 사용하므로 변환 필요
    const wlTool = toolGroup.getTool('WindowLevel');
    if (wlTool) {
      wlTool.setConfiguration({
        getWindowLevel: (viewportId: string) => {
          const vm = viewportManagerRef.current;
          if (!vm) return null;
          const vp = vm.getViewport(viewportId);
          if (!vp?.windowLevel || !vp.series) return null;

          // 정규화: 실제 픽셀 값 → 0~1 범위
          const maxValue = vp.series.isEncapsulated
            ? 255
            : Math.pow(2, vp.series.bitsStored ?? 8);
          return {
            center: vp.windowLevel.center / maxValue,
            width: vp.windowLevel.width / maxValue,
          };
        },
        setWindowLevel: (viewportId: string, wl: { center: number; width: number }) => {
          const vm = viewportManagerRef.current;
          if (!vm) return;
          const vp = vm.getViewport(viewportId);
          if (!vp?.series) return;

          // 역정규화: 0~1 범위 → 실제 픽셀 값
          const maxValue = vp.series.isEncapsulated
            ? 255
            : Math.pow(2, vp.series.bitsStored ?? 8);
          vm.setViewportWindowLevel(viewportId, {
            center: wl.center * maxValue,
            width: wl.width * maxValue,
          });
        },
      });
    }

    const panTool = toolGroup.getTool('Pan');
    if (panTool) {
      panTool.setConfiguration({
        getPan: (viewportId: string) => {
          const vm = viewportManagerRef.current;
          if (!vm) return null;
          const vp = vm.getViewport(viewportId);
          return vp?.transform.pan ?? null;
        },
        setPan: (viewportId: string, pan: { x: number; y: number }) => {
          viewportManagerRef.current?.setViewportPan(viewportId, pan);
        },
      });
    }

    const zoomTool = toolGroup.getTool('Zoom');
    if (zoomTool) {
      zoomTool.setConfiguration({
        getZoom: (viewportId: string) => {
          const vm = viewportManagerRef.current;
          if (!vm) return null;
          const vp = vm.getViewport(viewportId);
          return vp?.transform.zoom ?? null;
        },
        setZoom: (viewportId: string, zoom: number) => {
          viewportManagerRef.current?.setViewportZoom(viewportId, zoom);
        },
      });
    }

    const stackScrollTool = toolGroup.getTool('StackScroll');
    if (stackScrollTool) {
      stackScrollTool.setConfiguration({
        getFrameInfo: (viewportId: string) => {
          const vm = viewportManagerRef.current;
          if (!vm) return null;
          const vp = vm.getViewport(viewportId);
          if (!vp?.series) return null;
          return {
            currentFrame: vp.playback.currentFrame,
            frameCount: vp.series.frameCount,
          };
        },
        setFrame: (viewportId: string, frameIndex: number) => {
          viewportManagerRef.current?.setViewportFrame(viewportId, frameIndex);
        },
      });
    }

    // 도구 활성화 (기본 바인딩 적용)
    // isStaticImage에 따라 다른 기본 바인딩 사용
    const defaultBindings = isStaticImage ? DEFAULT_BINDINGS_STATIC : DEFAULT_BINDINGS_VIDEO;
    const finalBindings = { ...defaultBindings, ...bindingsRef.current };

    // 이전 값과 현재 값이 다르면 바인딩 변경 로그
    if (prevIsStaticImageRef.current !== isStaticImage) {
      console.log(
        `[useToolGroup] Mode changed: ${isStaticImage ? 'Static Image' : 'Video'} mode`,
        isStaticImage ? '(Wheel → Zoom)' : '(Wheel → StackScroll)',
      );
      prevIsStaticImageRef.current = isStaticImage;
    }

    // WindowLevel 활성화
    if (finalBindings.windowLevel.length > 0) {
      toolGroup.setToolActive('WindowLevel', { bindings: finalBindings.windowLevel });
    }

    // Pan 활성화
    if (finalBindings.pan.length > 0) {
      toolGroup.setToolActive('Pan', { bindings: finalBindings.pan });
    }

    // Zoom 활성화
    if (finalBindings.zoom.length > 0) {
      toolGroup.setToolActive('Zoom', { bindings: finalBindings.zoom });
    }

    // StackScroll 활성화 (정지 이미지에서는 비활성화)
    if (finalBindings.stackScroll.length > 0) {
      toolGroup.setToolActive('StackScroll', { bindings: finalBindings.stackScroll });
    } else {
      // 빈 바인딩이면 도구 비활성화
      toolGroup.setToolDisabled('StackScroll');
    }
  }, [toolGroup, disabled, isStaticImage]); // viewportManager 제거 (ref 사용)

  // 뷰포트 요소 등록/해제
  // viewportElementsKey가 변경되면 Map이 mutate되었음을 의미
  useEffect(() => {
    if (!toolGroup || disabled) return;

    const registered = registeredViewportsRef.current;

    // ToolGroup에 이미 등록된 뷰포트 확인 (HMR/StrictMode 대응)
    const toolGroupViewports = new Set(toolGroup.getViewportIds());

    // 새로 추가된 뷰포트 등록
    for (const [viewportId, element] of viewportElements) {
      // 로컬 ref에도 없고 ToolGroup에도 없을 때만 추가
      if (!registered.has(viewportId) && !toolGroupViewports.has(viewportId)) {
        toolGroup.addViewport(viewportId, element);
        registered.add(viewportId);
      } else if (!registered.has(viewportId) && toolGroupViewports.has(viewportId)) {
        // ToolGroup에는 있지만 로컬 ref에 없는 경우 (HMR 등으로 인해)
        // 로컬 ref만 업데이트
        registered.add(viewportId);
      }
    }

    // 제거된 뷰포트 해제
    for (const viewportId of registered) {
      if (!viewportElements.has(viewportId)) {
        toolGroup.removeViewport(viewportId);
        registered.delete(viewportId);
      }
    }
  }, [toolGroup, viewportElements, disabled, viewportElementsKey]);

  // 도구 활성화 함수
  const setToolActive = useCallback((toolName: string, toolBindings: ToolBinding[]) => {
    toolGroup?.setToolActive(toolName, { bindings: toolBindings });
  }, [toolGroup]);

  // 도구 비활성화 함수
  const setToolDisabled = useCallback((toolName: string) => {
    toolGroup?.setToolDisabled(toolName);
  }, [toolGroup]);

  // 모든 뷰포트 리셋
  const resetAllViewports = useCallback(() => {
    const vm = viewportManagerRef.current;
    if (!vm) return;

    for (const viewportId of viewportElements.keys()) {
      // resetViewport 메서드가 있으면 호출
      if ('resetViewport' in vm) {
        (vm as { resetViewport: (id: string) => void }).resetViewport(viewportId);
      } else {
        // 없으면 개별 속성 리셋
        vm.setViewportPan(viewportId, { x: 0, y: 0 });
        vm.setViewportZoom(viewportId, 1.0);
        vm.setViewportWindowLevel(viewportId, null);
      }
    }
  }, [viewportElements]); // viewportManager 제거 (ref 사용)

  return {
    toolGroup,
    setToolActive,
    setToolDisabled,
    resetAllViewports,
  };
}
