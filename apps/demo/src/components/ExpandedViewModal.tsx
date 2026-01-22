/**
 * 확대 보기 모달 컴포넌트
 * ESC 키로 닫기 지원
 */

import { useEffect } from 'react';
import { SingleDicomViewer } from '@echopixel/react';
import type { DicomImageInfo, Annotation } from '@echopixel/core';

interface ExpandedViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  frames: Uint8Array[];
  imageInfo: DicomImageInfo;
  isEncapsulated: boolean;
  annotations?: Annotation[];
  selectedAnnotationId?: string | null;
  onAnnotationSelect?: (id: string | null) => void;
  onAnnotationUpdate?: (annotation: Annotation) => void;
  onAnnotationDelete?: (id: string) => void;
  showAnnotations?: boolean;
}

export function ExpandedViewModal({
  isOpen,
  onClose,
  title,
  frames,
  imageInfo,
  isEncapsulated,
  annotations = [],
  selectedAnnotationId,
  onAnnotationSelect,
  onAnnotationUpdate,
  onAnnotationDelete,
  showAnnotations = true,
}: ExpandedViewModalProps) {
  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // body 스크롤 비활성화
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  // 뷰어 크기 계산 (헤더 ~50px, 패딩 40px, 여유 60px)
  const viewerWidth = Math.min(window.innerWidth - 80, 1200);
  const viewerHeight = Math.min(window.innerHeight - 150, 800);

  return (
    <div className="fixed inset-0 bg-black/[.98] z-[1000] flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="flex-shrink-0 flex justify-between items-center px-5 py-3 bg-viewer-surface border-b border-[#333] text-white">
        <h2 className="m-0 text-lg">
          🔍 확대 보기: {title}
        </h2>
        <button
          onClick={onClose}
          className="px-4 py-2 text-base bg-accent-error text-white border-none rounded-md cursor-pointer hover:bg-[#d55]"
        >
          ✕ 닫기 (ESC)
        </button>
      </div>

      {/* 확대된 SingleDicomViewer */}
      <div className="flex-1 flex justify-center items-start p-5 pt-2.5 overflow-auto min-h-0">
        <SingleDicomViewer
          frames={frames}
          imageInfo={imageInfo}
          isEncapsulated={isEncapsulated}
          width={viewerWidth}
          height={viewerHeight}
          initialFps={30}
          showAnnotations={showAnnotations}
          showToolbar={true}
          showControls={true}
          annotations={annotations}
          selectedAnnotationId={selectedAnnotationId}
          onAnnotationSelect={onAnnotationSelect}
          onAnnotationUpdate={onAnnotationUpdate}
          onAnnotationDelete={onAnnotationDelete}
        />
      </div>
    </div>
  );
}
