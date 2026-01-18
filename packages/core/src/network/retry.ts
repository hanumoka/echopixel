import { NetworkError } from './errors';

/**
 * 재시도 옵션
 */
export interface RetryOptions {
  /** 최대 재시도 횟수 (기본: 3) */
  maxRetries?: number;
  /** 기본 지연 시간 (ms) (기본: 1000) */
  baseDelay?: number;
  /** 최대 지연 시간 (ms) (기본: 10000) */
  maxDelay?: number;
  /** 요청 타임아웃 (ms) (기본: 30000) */
  timeout?: number;
  /** 재시도 시 호출되는 콜백 */
  onRetry?: (attempt: number, error: NetworkError, delay: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  timeout: 30000,
};

/**
 * 지수 백오프 지연 시간 계산
 *
 * 왜 지수 백오프를 사용하는가?
 * - 서버가 과부하 상태일 때 즉시 재시도하면 상황이 악화됨
 * - 점진적으로 간격을 늘려 서버 복구 시간을 확보
 * - 지터(jitter)를 추가하여 여러 클라이언트의 재시도가 분산됨
 *
 * 계산식: min(maxDelay, baseDelay * 2^attempt * (0.5 + random))
 * - attempt 0: 1s * 1 = 1s (0.5~1.5s)
 * - attempt 1: 1s * 2 = 2s (1~3s)
 * - attempt 2: 1s * 4 = 4s (2~6s)
 */
function calculateDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = 0.5 + Math.random(); // 0.5 ~ 1.5
  const delay = exponentialDelay * jitter;
  return Math.min(delay, maxDelay);
}

/**
 * 지수 백오프를 적용한 fetch 래퍼
 *
 * 사용 예:
 * ```typescript
 * const response = await retryFetch('https://api.example.com/data', {
 *   headers: { 'Authorization': 'Bearer token' }
 * }, {
 *   maxRetries: 3,
 *   onRetry: (attempt, error) => console.log(`Retry ${attempt}: ${error.message}`)
 * });
 * ```
 */
export async function retryFetch(
  url: string,
  fetchOptions?: RequestInit,
  retryOptions?: RetryOptions,
): Promise<Response> {
  const options = { ...DEFAULT_OPTIONS, ...retryOptions };
  const { maxRetries, baseDelay, maxDelay, timeout, onRetry } = options;

  let lastError: NetworkError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // AbortController로 타임아웃 구현
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // HTTP 에러 처리
      if (!response.ok) {
        const error = NetworkError.fromStatus(response.status);

        // 재시도 불가능한 에러는 즉시 throw
        if (!error.retryable) {
          throw error;
        }

        throw error;
      }

      return response;
    } catch (error) {
      lastError = NetworkError.fromFetchError(error);

      // 재시도 불가능한 에러는 즉시 throw
      if (!lastError.retryable) {
        throw lastError;
      }

      // 마지막 시도였으면 에러 throw
      if (attempt >= maxRetries) {
        throw lastError;
      }

      // 재시도 전 지연
      const delay = calculateDelay(attempt, baseDelay, maxDelay);

      if (onRetry) {
        onRetry(attempt + 1, lastError, delay);
      }

      await sleep(delay);
    }
  }

  // 이 코드에 도달하면 안 됨 (컴파일러를 위한 안전장치)
  throw lastError ?? new NetworkError('Unknown error', 'UNKNOWN');
}

/**
 * Promise 기반 sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 여러 URL에 대해 병렬로 fetch 시도하고 첫 번째 성공 반환
 *
 * 사용 예: 여러 미러 서버 중 가장 빠른 응답 사용
 */
export async function raceFetch(
  urls: string[],
  fetchOptions?: RequestInit,
  retryOptions?: RetryOptions,
): Promise<{ response: Response; url: string }> {
  if (urls.length === 0) {
    throw new NetworkError('No URLs provided', 'BAD_REQUEST');
  }

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const response = await retryFetch(url, fetchOptions, retryOptions);
      return { response, url };
    }),
  );

  // 첫 번째 성공 결과 반환
  for (const result of results) {
    if (result.status === 'fulfilled') {
      return result.value;
    }
  }

  // 모두 실패한 경우 첫 번째 에러 throw
  const firstRejected = results[0] as PromiseRejectedResult;
  throw firstRejected.reason;
}
