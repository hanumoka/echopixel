/**
 * 어노테이션 CRUD 관리 훅
 */

import { useState, useCallback } from 'react';
import type { Annotation } from '@echopixel/core';

interface UseAnnotationsReturn {
  annotations: Annotation[];
  setAnnotations: (annotations: Annotation[]) => void;
  updateAnnotation: (annotation: Annotation) => void;
  deleteAnnotation: (id: string) => void;
  selectedId: string | null;
  selectAnnotation: (id: string | null) => void;
  showAnnotations: boolean;
  setShowAnnotations: (show: boolean) => void;
  clearAll: () => void;
}

export function useAnnotations(initialAnnotations: Annotation[] = []): UseAnnotationsReturn {
  const [annotations, setAnnotations] = useState<Annotation[]>(initialAnnotations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAnnotations, setShowAnnotations] = useState(true);

  // 어노테이션 업데이트 (새 어노테이션 추가 또는 기존 수정)
  const updateAnnotation = useCallback((annotation: Annotation) => {
    setAnnotations((prev) => {
      const existingIndex = prev.findIndex((a) => a.id === annotation.id);
      if (existingIndex >= 0) {
        // 기존 어노테이션 업데이트
        console.log('[useAnnotations] Annotation updated:', annotation.id);
        const newList = [...prev];
        newList[existingIndex] = annotation;
        return newList;
      } else {
        // 새 어노테이션 추가
        console.log('[useAnnotations] Annotation created:', annotation.id);
        return [...prev, annotation];
      }
    });
  }, []);

  // 어노테이션 삭제
  const deleteAnnotation = useCallback((id: string) => {
    console.log('[useAnnotations] Annotation deleted:', id);
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  }, []);

  // 어노테이션 선택
  const selectAnnotation = useCallback((id: string | null) => {
    console.log('[useAnnotations] Annotation selected:', id);
    setSelectedId(id);
  }, []);

  // 전체 초기화
  const clearAll = useCallback(() => {
    setAnnotations([]);
    setSelectedId(null);
  }, []);

  return {
    annotations,
    setAnnotations,
    updateAnnotation,
    deleteAnnotation,
    selectedId,
    selectAnnotation,
    showAnnotations,
    setShowAnnotations,
    clearAll,
  };
}

// 다중 뷰포트용 어노테이션 관리 훅
interface UseMultiAnnotationsReturn {
  annotations: Map<string, Annotation[]>;
  setAnnotations: (annotations: Map<string, Annotation[]>) => void;
  updateAnnotation: (viewportId: string, annotation: Annotation) => void;
  deleteAnnotation: (viewportId: string, annotationId: string) => void;
  getAnnotationsForViewport: (viewportId: string) => Annotation[];
  selectedId: string | null;
  selectAnnotation: (viewportId: string, annotationId: string | null) => void;
  showAnnotations: boolean;
  setShowAnnotations: (show: boolean) => void;
  clearAll: () => void;
}

export function useMultiAnnotations(): UseMultiAnnotationsReturn {
  const [annotations, setAnnotations] = useState<Map<string, Annotation[]>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAnnotations, setShowAnnotations] = useState(true);

  // 특정 뷰포트의 어노테이션 가져오기
  const getAnnotationsForViewport = useCallback(
    (viewportId: string): Annotation[] => {
      return annotations.get(viewportId) ?? [];
    },
    [annotations]
  );

  // 어노테이션 업데이트
  const updateAnnotation = useCallback((viewportId: string, annotation: Annotation) => {
    setAnnotations((prev) => {
      const newMap = new Map(prev);
      const viewportAnnotations = newMap.get(viewportId) ?? [];

      const existingIndex = viewportAnnotations.findIndex((a) => a.id === annotation.id);
      if (existingIndex >= 0) {
        console.log('[useMultiAnnotations] Annotation updated:', viewportId, annotation.id);
        const newList = [...viewportAnnotations];
        newList[existingIndex] = annotation;
        newMap.set(viewportId, newList);
      } else {
        console.log('[useMultiAnnotations] Annotation created:', viewportId, annotation.id);
        newMap.set(viewportId, [...viewportAnnotations, annotation]);
      }

      return newMap;
    });
  }, []);

  // 어노테이션 삭제
  const deleteAnnotation = useCallback((viewportId: string, annotationId: string) => {
    console.log('[useMultiAnnotations] Annotation deleted:', viewportId, annotationId);
    setAnnotations((prev) => {
      const newMap = new Map(prev);
      const viewportAnnotations = newMap.get(viewportId) ?? [];
      newMap.set(
        viewportId,
        viewportAnnotations.filter((a) => a.id !== annotationId)
      );
      return newMap;
    });
    setSelectedId((prev) => (prev === annotationId ? null : prev));
  }, []);

  // 어노테이션 선택
  const selectAnnotation = useCallback((_viewportId: string, annotationId: string | null) => {
    console.log('[useMultiAnnotations] Annotation selected:', annotationId);
    setSelectedId(annotationId);
  }, []);

  // 전체 초기화
  const clearAll = useCallback(() => {
    setAnnotations(new Map());
    setSelectedId(null);
  }, []);

  return {
    annotations,
    setAnnotations,
    updateAnnotation,
    deleteAnnotation,
    getAnnotationsForViewport,
    selectedId,
    selectAnnotation,
    showAnnotations,
    setShowAnnotations,
    clearAll,
  };
}
