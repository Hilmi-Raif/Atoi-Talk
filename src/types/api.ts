export interface ApiResponse<T> {
  data: T;
}

export interface ApiError {
  error: string;
}

export interface PaginationMeta {
  has_next: boolean;
  has_prev: boolean;
  next_cursor: string;
  prev_cursor: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface PaginationParams {
  cursor?: string;
  limit?: number;
}
