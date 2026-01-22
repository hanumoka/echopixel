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
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.98)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 20px',
          background: '#1a1a2e',
          borderBottom: '1px solid #333',
          color: '#fff',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '16px' }}>
          🔍 확대 보기: {title}
        </h2>
        <button
          onClick={onClose}
          style={{
            padding: '8px 16px',
            fontSize: '13px',
            background: '#c44',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          ✕ 닫기 (ESC)
        </button>
      </div>

      {/* 확대된 SingleDicomViewer */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: '20px',
          paddingTop: '10px',
          overflow: 'auto',
          minHeight: 0,
        }}
      >
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
