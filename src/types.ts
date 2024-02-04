export type BunchoidConfig<P> = {
  key: any[];
  wait: number;
  maxWait?: number;
  payload?: P;
  includeMeta?: boolean;
};

export type BunchoidExecution<P> = {
  key: any[];
  payloads: P[];
  invokeCount: number;
  promise: Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  createdAt: number;
  scheduledAt: number;
};

export type ExecutionPath = {
  execution?: BunchoidExecution<any>;
  children: Map<any, ExecutionPath>;
  parent: ExecutionPath | null;
  parentKey?: any;
};
