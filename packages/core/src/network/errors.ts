/**
 * 네트워크 에러 타입
 *
 * HTTP 상태 코드를 의미 있는 에러 타입으로 매핑
 * 클라이언트가 에러 종류에 따라 다르게 처리할 수 있음
 */
export type NetworkErrorType =
  | 'TIMEOUT' // 요청 시간 초과
  | 'NETWORK' // 네트워크 연결 실패
  | 'NOT_FOUND' // 404 - 리소스 없음
  | 'UNAUTHORIZED' // 401 - 인증 필요
  | 'FORBIDDEN' // 403 - 권한 없음
  | 'SERVER_ERROR' // 5xx - 서버 에러
  | 'BAD_REQUEST' // 400 - 잘못된 요청
  | 'UNKNOWN'; // 기타

/**
 * 네트워크 에러 클래스
 *
 * 왜 커스텀 에러를 사용하는가?
 * - HTTP 상태 코드와 에러 타입을 함께 저장
 * - instanceof로 네트워크 에러 구분 가능
 * - 재시도 가능 여부 판단에 활용
 */
export class NetworkError extends Error {
  readonly type: NetworkErrorType;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(message: string, type: NetworkErrorType, status?: number) {
    super(message);
    this.name = 'NetworkError';
    this.type = type;
    this.status = status;

    // 재시도 가능 여부 결정
    // - TIMEOUT, NETWORK, SERVER_ERROR는 재시도 가능
    // - NOT_FOUND, UNAUTHORIZED, FORBIDDEN, BAD_REQUEST는 재시도 불필요
    this.retryable = ['TIMEOUT', 'NETWORK', 'SERVER_ERROR'].includes(type);

    // Error 클래스를 상속할 때 필요한 프로토타입 체인 수정
    Object.setPrototypeOf(this, NetworkError.prototype);
  }

  /**
   * HTTP 상태 코드로부터 NetworkError 생성
   */
  static fromStatus(status: number, message?: string): NetworkError {
    const type = mapStatusToType(status);
    const defaultMessage = getDefaultMessage(type, status);
    return new NetworkError(message || defaultMessage, type, status);
  }

  /**
   * fetch 에러로부터 NetworkError 생성
   */
  static fromFetchError(error: unknown): NetworkError {
    if (error instanceof NetworkError) {
      return error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      return new NetworkError('Request timed out', 'TIMEOUT');
    }

    if (error instanceof TypeError) {
      // fetch의 TypeError는 보통 네트워크 연결 실패
      return new NetworkError('Network connection failed', 'NETWORK');
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return new NetworkError(message, 'UNKNOWN');
  }
}

/**
 * HTTP 상태 코드를 NetworkErrorType으로 매핑
 */
function mapStatusToType(status: number): NetworkErrorType {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status >= 500) return 'SERVER_ERROR';
  return 'UNKNOWN';
}

/**
 * 에러 타입별 기본 메시지
 */
function getDefaultMessage(type: NetworkErrorType, status?: number): string {
  switch (type) {
    case 'TIMEOUT':
      return 'Request timed out';
    case 'NETWORK':
      return 'Network connection failed';
    case 'NOT_FOUND':
      return 'Resource not found (404)';
    case 'UNAUTHORIZED':
      return 'Authentication required (401)';
    case 'FORBIDDEN':
      return 'Access denied (403)';
    case 'SERVER_ERROR':
      return `Server error (${status})`;
    case 'BAD_REQUEST':
      return 'Bad request (400)';
    default:
      return `HTTP error (${status})`;
  }
}
