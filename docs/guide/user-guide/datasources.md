# 데이터 소스

EchoPixel은 다양한 방법으로 DICOM 데이터를 로드할 수 있습니다. 이 문서에서는 로컬 파일과 WADO-RS 서버에서 데이터를 가져오는 방법을 설명합니다.

---

## 목차

1. [데이터 소스 개요](#데이터-소스-개요)
2. [로컬 파일 로드](#로컬-파일-로드)
3. [WADO-RS 서버 연동](#wado-rs-서버-연동)
4. [DataSource 인터페이스](#datasource-인터페이스)
5. [에러 처리](#에러-처리)

---

## 데이터 소스 개요

### 지원되는 데이터 소스

| 소스 | 클래스 | 사용 사례 |
|------|--------|-----------|
| **로컬 파일** | `LocalFileDataSource` | 파일 업로드, 개발/테스트 |
| **WADO-RS** | `WadoRsDataSource` | PACS 서버 연동, 프로덕션 |

### DICOM 데이터 구조

```
Study (검사)
  └── Series (시리즈)
        └── Instance (인스턴스/이미지)
              └── Frame (프레임) - 멀티프레임 영상의 경우
```

---

## 로컬 파일 로드

### 단일 파일 로드

```tsx
import {
  isDicomFile,
  parseDicom,
  getImageInfo,
  extractPixelData,
} from '@echopixel/core';

async function loadLocalFile(file: File) {
  // 1. 파일을 ArrayBuffer로 읽기
  const buffer = await file.arrayBuffer();

  // 2. DICOM 파일 확인
  if (!isDicomFile(buffer)) {
    throw new Error('유효한 DICOM 파일이 아닙니다');
  }

  // 3. DICOM 파싱
  const dataset = parseDicom(buffer);

  // 4. 이미지 정보 추출
  const imageInfo = getImageInfo(buffer, dataset);

  // 5. 픽셀 데이터 추출
  const pixelData = extractPixelData(buffer, dataset);

  return {
    frames: pixelData.frames,
    imageInfo,
    isEncapsulated: pixelData.isEncapsulated,
  };
}
```

### 파일 입력 컴포넌트

```tsx
function FileUploader({ onLoad }) {
  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await loadLocalFile(file);
      onLoad(data);
    } catch (error) {
      console.error('파일 로드 실패:', error);
    }
  };

  return (
    <input
      type="file"
      accept=".dcm,.dicom,application/dicom"
      onChange={handleChange}
    />
  );
}
```

### 드래그 앤 드롭

```tsx
function DragDropUploader({ onLoad }) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      const data = await loadLocalFile(file);
      onLoad(data);
    }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      style={{
        padding: '40px',
        border: `2px dashed ${isDragging ? '#00ff00' : '#666'}`,
        textAlign: 'center',
      }}
    >
      DICOM 파일을 여기에 드롭하세요
    </div>
  );
}
```

### 다중 파일 로드

```tsx
async function loadMultipleFiles(files: FileList) {
  const results = [];

  for (const file of Array.from(files)) {
    try {
      const data = await loadLocalFile(file);
      results.push({
        id: file.name,
        ...data,
      });
    } catch (error) {
      console.warn(`파일 로드 실패: ${file.name}`, error);
    }
  }

  return results;
}
```

---

## WADO-RS 서버 연동

### WADO-RS란?

**WADO-RS (Web Access to DICOM Objects - RESTful Services)**는 DICOM 서버에 HTTP로 접근하는 표준입니다.

### 기본 URL 구조

```
{baseUrl}/studies/{studyUID}/series/{seriesUID}/instances/{sopInstanceUID}
```

### WadoRsDataSource 사용

```tsx
import { WadoRsDataSource } from '@echopixel/core';

// DataSource 생성
const dataSource = new WadoRsDataSource({
  baseUrl: 'https://your-dicom-server.com/dicom-web',
  // 선택적 인증 헤더
  headers: {
    'Authorization': 'Bearer your-token',
  },
});

// 메타데이터 조회
const metadata = await dataSource.getMetadata({
  studyUID: '1.2.3.4.5',
  seriesUID: '1.2.3.4.5.6',
  sopInstanceUID: '1.2.3.4.5.6.7',
});

// 프레임 로드
const frame = await dataSource.loadFrame({
  studyUID: '1.2.3.4.5',
  seriesUID: '1.2.3.4.5.6',
  sopInstanceUID: '1.2.3.4.5.6.7',
  frameNumber: 1,
});
```

### 완전한 WADO-RS 예제

```tsx
import { useState } from 'react';
import { WadoRsDataSource, getImageInfo, extractPixelData } from '@echopixel/core';
import { SingleDicomViewer } from '@echopixel/react';

function WadoViewer() {
  const [viewportData, setViewportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // WADO 설정
  const [config, setConfig] = useState({
    baseUrl: 'https://your-server.com/dicom-web',
    studyUID: '',
    seriesUID: '',
    sopInstanceUID: '',
  });

  const handleLoad = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. DataSource 생성
      const dataSource = new WadoRsDataSource({
        baseUrl: config.baseUrl,
      });

      // 2. 인스턴스 전체 로드
      const instanceUrl = `${config.baseUrl}/studies/${config.studyUID}/series/${config.seriesUID}/instances/${config.sopInstanceUID}`;

      const response = await fetch(instanceUrl, {
        headers: { 'Accept': 'application/dicom' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const buffer = await response.arrayBuffer();

      // 3. 파싱
      const dataset = parseDicom(buffer);
      const imageInfo = getImageInfo(buffer, dataset);
      const pixelData = extractPixelData(buffer, dataset);

      setViewportData({
        frames: pixelData.frames,
        imageInfo,
        isEncapsulated: pixelData.isEncapsulated,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* 설정 폼 */}
      <div style={{ marginBottom: '20px' }}>
        <input
          placeholder="Base URL"
          value={config.baseUrl}
          onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
          style={{ width: '300px', marginRight: '10px' }}
        />
        <input
          placeholder="Study UID"
          value={config.studyUID}
          onChange={(e) => setConfig({ ...config, studyUID: e.target.value })}
          style={{ width: '200px', marginRight: '10px' }}
        />
        <input
          placeholder="Series UID"
          value={config.seriesUID}
          onChange={(e) => setConfig({ ...config, seriesUID: e.target.value })}
          style={{ width: '200px', marginRight: '10px' }}
        />
        <input
          placeholder="SOP Instance UID"
          value={config.sopInstanceUID}
          onChange={(e) => setConfig({ ...config, sopInstanceUID: e.target.value })}
          style={{ width: '200px', marginRight: '10px' }}
        />
        <button onClick={handleLoad} disabled={loading}>
          {loading ? '로딩...' : '로드'}
        </button>
      </div>

      {/* 에러 표시 */}
      {error && <div style={{ color: 'red' }}>에러: {error}</div>}

      {/* 뷰어 */}
      {viewportData && (
        <SingleDicomViewer
          frames={viewportData.frames}
          imageInfo={viewportData.imageInfo}
          isEncapsulated={viewportData.isEncapsulated}
          width={768}
          height={576}
        />
      )}
    </div>
  );
}
```

### 시리즈 인스턴스 목록 조회

```tsx
async function fetchSeriesInstances(baseUrl: string, studyUID: string, seriesUID: string) {
  const url = `${baseUrl}/studies/${studyUID}/series/${seriesUID}/instances`;

  const response = await fetch(url, {
    headers: { 'Accept': 'application/dicom+json' },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const instances = await response.json();

  // 인스턴스 목록 반환
  return instances.map((instance: any) => ({
    sopInstanceUID: instance['00080018']?.Value?.[0],
    instanceNumber: instance['00200013']?.Value?.[0],
    numberOfFrames: instance['00280008']?.Value?.[0] || 1,
  }));
}
```

### 인증 처리

```tsx
// Bearer 토큰 인증
const dataSource = new WadoRsDataSource({
  baseUrl: 'https://your-server.com/dicom-web',
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  },
});

// Basic 인증
const dataSource = new WadoRsDataSource({
  baseUrl: 'https://your-server.com/dicom-web',
  headers: {
    'Authorization': 'Basic ' + btoa('username:password'),
  },
});
```

---

## DataSource 인터페이스

### 인터페이스 정의

```typescript
interface DataSource {
  /**
   * DICOM 메타데이터 조회
   */
  getMetadata(id: DicomInstanceId): Promise<DicomMetadata>;

  /**
   * 특정 프레임 로드
   */
  loadFrame(options: LoadFrameOptions): Promise<ArrayBuffer>;

  /**
   * 모든 프레임 로드
   */
  loadAllFrames(id: DicomInstanceId): Promise<ArrayBuffer[]>;
}

interface DicomInstanceId {
  studyUID: string;
  seriesUID: string;
  sopInstanceUID: string;
}

interface LoadFrameOptions extends DicomInstanceId {
  frameNumber: number;  // 1-based
}
```

### 커스텀 DataSource 구현

```tsx
class MyCustomDataSource implements DataSource {
  constructor(private config: MyConfig) {}

  async getMetadata(id: DicomInstanceId): Promise<DicomMetadata> {
    // 커스텀 구현
    const response = await fetch(`${this.config.apiUrl}/metadata/${id.sopInstanceUID}`);
    return response.json();
  }

  async loadFrame(options: LoadFrameOptions): Promise<ArrayBuffer> {
    // 커스텀 구현
    const response = await fetch(
      `${this.config.apiUrl}/frames/${options.sopInstanceUID}/${options.frameNumber}`
    );
    return response.arrayBuffer();
  }

  async loadAllFrames(id: DicomInstanceId): Promise<ArrayBuffer[]> {
    // 커스텀 구현
    const metadata = await this.getMetadata(id);
    const frames = [];

    for (let i = 1; i <= metadata.numberOfFrames; i++) {
      const frame = await this.loadFrame({ ...id, frameNumber: i });
      frames.push(frame);
    }

    return frames;
  }
}
```

---

## 에러 처리

### 일반적인 에러 유형

| 에러 | 원인 | 해결 |
|------|------|------|
| `NetworkError` | 네트워크 연결 실패 | 서버 URL 확인, 네트워크 상태 확인 |
| `401 Unauthorized` | 인증 실패 | 토큰/자격증명 확인 |
| `403 Forbidden` | 권한 없음 | 접근 권한 확인 |
| `404 Not Found` | 리소스 없음 | UID 확인 |
| `CORS Error` | CORS 정책 위반 | 서버 CORS 설정 확인 |

### 재시도 로직

```tsx
import { retryFetch } from '@echopixel/core';

// 최대 3회 재시도
const response = await retryFetch(url, {
  maxRetries: 3,
  retryDelay: 1000,  // 1초 간격
  headers: { 'Accept': 'application/dicom' },
});
```

### 타임아웃 처리

```tsx
import { raceFetch } from '@echopixel/core';

// 30초 타임아웃
const response = await raceFetch(url, {
  timeout: 30000,
  headers: { 'Accept': 'application/dicom' },
});
```

### 에러 처리 패턴

```tsx
function DicomLoader({ config }) {
  const [state, setState] = useState({
    loading: false,
    error: null,
    data: null,
  });

  const load = async () => {
    setState({ loading: true, error: null, data: null });

    try {
      const data = await loadDicomData(config);
      setState({ loading: false, error: null, data });
    } catch (error) {
      // 에러 유형별 처리
      if (error.name === 'NetworkError') {
        setState({
          loading: false,
          error: '네트워크 연결을 확인하세요.',
          data: null,
        });
      } else if (error.status === 401) {
        setState({
          loading: false,
          error: '인증이 필요합니다. 다시 로그인하세요.',
          data: null,
        });
      } else {
        setState({
          loading: false,
          error: `오류: ${error.message}`,
          data: null,
        });
      }
    }
  };

  return (
    <div>
      <button onClick={load} disabled={state.loading}>
        {state.loading ? '로딩 중...' : '로드'}
      </button>

      {state.error && (
        <div style={{ color: 'red', marginTop: '10px' }}>
          {state.error}
        </div>
      )}

      {state.data && (
        <SingleDicomViewer {...state.data} width={768} height={576} />
      )}
    </div>
  );
}
```

---

## 다음 단계

- [고급 사용법](./advanced.md) - 성능 최적화
- [문제 해결](./troubleshooting.md) - 자주 발생하는 문제
