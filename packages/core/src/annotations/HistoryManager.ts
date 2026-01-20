/**
 * History Manager
 *
 * Undo/Redo 관리
 *
 * 책임:
 * - 변경 이력 기록
 * - Undo/Redo 실행
 * - 히스토리 스택 관리
 *
 * Command 패턴:
 * - Create: previousState=null, newState=annotation
 * - Update: previousState=before, newState=after
 * - Delete: previousState=annotation, newState=null
 */

import type { Annotation, AnnotationCommand } from './types';
import type { AnnotationStore } from './AnnotationStore';

// =============================================================================
// Types
// =============================================================================

/**
 * Undo 단위 (단일 명령 또는 배치)
 */
type UndoUnit = AnnotationCommand | AnnotationCommand[];

/**
 * HistoryManager 옵션
 */
export interface HistoryManagerOptions {
  /** 최대 히스토리 크기 (기본: 50) */
  maxSize?: number;
  /** 변경 콜백 */
  onChange?: (canUndo: boolean, canRedo: boolean) => void;
}

// =============================================================================
// History Manager
// =============================================================================

/**
 * 히스토리 관리자
 *
 * Undo/Redo 기능 제공
 */
export class HistoryManager {
  /** Undo 스택 (단일 명령 또는 배치) */
  private undoStack: UndoUnit[] = [];

  /** Redo 스택 (단일 명령 또는 배치) */
  private redoStack: UndoUnit[] = [];

  /** 최대 히스토리 크기 */
  private maxSize: number;

  /** 변경 콜백 */
  private onChange?: (canUndo: boolean, canRedo: boolean) => void;

  /** 연결된 AnnotationStore */
  private store: AnnotationStore | null = null;

  /** 일괄 작업 중 플래그 */
  private isBatching = false;

  /** 일괄 작업 버퍼 */
  private batchBuffer: AnnotationCommand[] = [];

  constructor(options: HistoryManagerOptions = {}) {
    this.maxSize = options.maxSize ?? 50;
    this.onChange = options.onChange;
  }

  // ---------------------------------------------------------------------------
  // Store 연결
  // ---------------------------------------------------------------------------

  /**
   * AnnotationStore 연결
   *
   * @param store - 연결할 스토어
   */
  attach(store: AnnotationStore): void {
    this.store = store;
  }

  /**
   * AnnotationStore 연결 해제
   */
  detach(): void {
    this.store = null;
  }

  // ---------------------------------------------------------------------------
  // 명령 기록
  // ---------------------------------------------------------------------------

  /**
   * Create 명령 기록
   *
   * @param annotation - 생성된 어노테이션
   */
  recordCreate(annotation: Annotation): void {
    const command: AnnotationCommand = {
      type: 'create',
      annotationId: annotation.id,
      dicomId: annotation.dicomId,
      frameIndex: annotation.frameIndex,
      previousState: null,
      newState: this.cloneAnnotation(annotation),
      timestamp: Date.now(),
    };

    this.pushCommand(command);
  }

  /**
   * Update 명령 기록
   *
   * @param before - 수정 전 어노테이션
   * @param after - 수정 후 어노테이션
   */
  recordUpdate(before: Annotation, after: Annotation): void {
    const command: AnnotationCommand = {
      type: 'update',
      annotationId: after.id,
      dicomId: after.dicomId,
      frameIndex: after.frameIndex,
      previousState: this.cloneAnnotation(before),
      newState: this.cloneAnnotation(after),
      timestamp: Date.now(),
    };

    this.pushCommand(command);
  }

  /**
   * Delete 명령 기록
   *
   * @param annotation - 삭제된 어노테이션
   */
  recordDelete(annotation: Annotation): void {
    const command: AnnotationCommand = {
      type: 'delete',
      annotationId: annotation.id,
      dicomId: annotation.dicomId,
      frameIndex: annotation.frameIndex,
      previousState: this.cloneAnnotation(annotation),
      newState: null,
      timestamp: Date.now(),
    };

    this.pushCommand(command);
  }

  // ---------------------------------------------------------------------------
  // Undo/Redo
  // ---------------------------------------------------------------------------

  /**
   * Undo 가능 여부
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Redo 가능 여부
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Undo 실행
   *
   * @returns 실행된 명령(들) 또는 null
   */
  undo(): AnnotationCommand | AnnotationCommand[] | null {
    if (!this.canUndo() || !this.store) {
      return null;
    }

    const unit = this.undoStack.pop()!;

    // 배치인 경우 역순으로 실행
    if (Array.isArray(unit)) {
      for (let i = unit.length - 1; i >= 0; i--) {
        this.executeReverse(unit[i]);
      }
    } else {
      this.executeReverse(unit);
    }

    // Redo 스택에 추가
    this.redoStack.push(unit);

    // 콜백
    this.notifyChange();

    return unit;
  }

  /**
   * Redo 실행
   *
   * @returns 실행된 명령(들) 또는 null
   */
  redo(): AnnotationCommand | AnnotationCommand[] | null {
    if (!this.canRedo() || !this.store) {
      return null;
    }

    const unit = this.redoStack.pop()!;

    // 배치인 경우 순서대로 실행
    if (Array.isArray(unit)) {
      for (const command of unit) {
        this.executeForward(command);
      }
    } else {
      this.executeForward(unit);
    }

    // Undo 스택에 추가
    this.undoStack.push(unit);

    // 콜백
    this.notifyChange();

    return unit;
  }

  // ---------------------------------------------------------------------------
  // 일괄 작업 (Batch)
  // ---------------------------------------------------------------------------

  /**
   * 일괄 작업 시작
   *
   * 여러 명령을 하나의 Undo 단위로 묶음
   */
  startBatch(): void {
    this.isBatching = true;
    this.batchBuffer = [];
  }

  /**
   * 일괄 작업 종료
   *
   * 버퍼의 명령들을 하나의 Undo 단위로 저장
   */
  endBatch(): void {
    if (!this.isBatching) {
      return;
    }

    this.isBatching = false;

    if (this.batchBuffer.length === 0) {
      return;
    }

    // 배치를 하나의 Undo 단위로 저장
    if (this.batchBuffer.length === 1) {
      // 단일 명령이면 배열로 감싸지 않음
      this.undoStack.push(this.batchBuffer[0]);
    } else {
      // 여러 명령이면 배열로 저장
      this.undoStack.push([...this.batchBuffer]);
    }

    // 스택 크기 제한
    this.trimStack();

    // Redo 스택 초기화
    this.redoStack = [];

    // 콜백
    this.notifyChange();

    this.batchBuffer = [];
  }

  /**
   * 일괄 작업 취소
   */
  cancelBatch(): void {
    this.isBatching = false;
    this.batchBuffer = [];
  }

  // ---------------------------------------------------------------------------
  // 스택 관리
  // ---------------------------------------------------------------------------

  /**
   * 히스토리 초기화
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.batchBuffer = [];
    this.isBatching = false;
    this.notifyChange();
  }

  /**
   * 현재 상태 정보
   */
  getState(): {
    undoCount: number;
    redoCount: number;
    canUndo: boolean;
    canRedo: boolean;
  } {
    return {
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
    };
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /**
   * 명령 추가
   */
  private pushCommand(command: AnnotationCommand): void {
    if (this.isBatching) {
      this.batchBuffer.push(command);
      return;
    }

    this.undoStack.push(command);

    // 스택 크기 제한
    this.trimStack();

    // Redo 스택 초기화 (새 명령 시 Redo 불가)
    this.redoStack = [];

    // 콜백
    this.notifyChange();
  }

  /**
   * 스택 크기 제한
   */
  private trimStack(): void {
    while (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
  }

  /**
   * 명령 역실행 (Undo용)
   */
  private executeReverse(command: AnnotationCommand): void {
    if (!this.store) {
      return;
    }

    switch (command.type) {
      case 'create':
        // 생성 취소 → 삭제
        if (command.newState) {
          this.forceDelete(command.dicomId, command.annotationId);
        }
        break;

      case 'update':
        // 수정 취소 → 이전 상태로 복원
        if (command.previousState) {
          this.forceRestore(command.previousState);
        }
        break;

      case 'delete':
        // 삭제 취소 → 복원
        if (command.previousState) {
          this.forceRestore(command.previousState);
        }
        break;
    }
  }

  /**
   * 명령 실행 (Redo용)
   */
  private executeForward(command: AnnotationCommand): void {
    if (!this.store) {
      return;
    }

    switch (command.type) {
      case 'create':
        // 생성 재실행
        if (command.newState) {
          this.forceRestore(command.newState);
        }
        break;

      case 'update':
        // 수정 재실행
        if (command.newState) {
          this.forceRestore(command.newState);
        }
        break;

      case 'delete':
        // 삭제 재실행
        this.forceDelete(command.dicomId, command.annotationId);
        break;
    }
  }

  /**
   * 강제 삭제 (권한 무시)
   */
  private forceDelete(dicomId: string, annotationId: string): void {
    // AnnotationStore의 internal 메서드 사용 (권한 검사 우회)
    this.store?._forceDelete(dicomId, annotationId);
  }

  /**
   * 강제 복원 (제한 무시, 덮어쓰기 허용)
   */
  private forceRestore(annotation: Annotation): void {
    // AnnotationStore의 internal 메서드 사용 (제한 검사 우회, 덮어쓰기)
    this.store?._forceRestore(annotation);
  }

  /**
   * 어노테이션 복사 (불변성 보장)
   */
  private cloneAnnotation(annotation: Annotation): Annotation {
    return {
      ...annotation,
      points: annotation.points.map((p) => ({ ...p })),
      labelPosition: { ...annotation.labelPosition },
      customData: annotation.customData
        ? { ...annotation.customData }
        : undefined,
    };
  }

  /**
   * 변경 알림
   */
  private notifyChange(): void {
    if (this.onChange) {
      this.onChange(this.canUndo(), this.canRedo());
    }
  }
}
