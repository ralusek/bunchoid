// Types
import { ExecutionPath, BunchoidConfig, BunchoidExecution } from './types';

const globalIsolate = isolate();

export default globalIsolate;
export const getExecutionPathMeta = globalIsolate.getExecutionPathMeta;

const timeouts = new WeakMap<BunchoidExecution<any>, NodeJS.Timeout>();

export function isolate() {
  const executions = {
    children: new Map<any, ExecutionPath>(),
    parent: null,
  };

  function bunchoid<T, P>(fn: () => T | Promise<T>, config: Omit<BunchoidConfig<P>, 'includeMeta'> & { includeMeta: false }): Promise<T>;
  function bunchoid<T, P>(fn: () => T | Promise<T>, config: Omit<BunchoidConfig<P>, 'includeMeta'> & { includeMeta: undefined }): Promise<T>;
  function bunchoid<T, P>(fn: () => T | Promise<T>, config: Omit<BunchoidConfig<P>, 'includeMeta'> & { includeMeta: true }): Promise<{ payloads: P[]; result: T; invokeCount: number; }>;
  async function bunchoid<T, P>(
    fn: () => T | Promise<T>,
    {
      key,
      wait,
      payload,
      maxWait = 1000 * 60,
      includeMeta = false,
    }: BunchoidConfig<P>,
  ) {
    const executionPath = findOrCreateExecutionPath(key, executions);

    if (!executionPath.execution) executionPath.execution = createExecution({ key, wait, maxWait });
    else updateExecution(executionPath.execution, { wait, maxWait });

    executionPath.execution.invokeCount += 1;

    const payloads = executionPath.execution.payloads;
    if (payload !== undefined) payloads.push(payload);

    clearTimeout(timeouts.get(executionPath.execution));

    const timeout = setTimeout(async () => {
      const execution = executionPath.execution!;
      executionPath.execution = undefined;
      timeouts.delete(execution); // Probably not necessary because WeakMap
      
      prunePath(executionPath);

      try {
        const result = await fn();
        execution.resolve(includeMeta ? { payloads, result, invokeCount: execution.invokeCount } : result);
      }
      catch (error) {
        execution.reject(includeMeta ? { payloads, error, invokeCount: execution.invokeCount } : error);
      }
    }, executionPath.execution.scheduledAt - Date.now());
  
    timeouts.set(executionPath.execution, timeout);

    return executionPath.execution.promise;
  }

  function getExecutionPathMeta(key: any[]) {
    let current: ExecutionPath | null = executions;
    for (const value of key) {
      current = current.children.get(value)!;
      if (!current) return null;
    }
  
    return {
      execution: current.execution ? { ...current.execution } : undefined,
      childrenCount: current.children.size,
    };
  }

  bunchoid.getExecutionPathMeta = getExecutionPathMeta;

  return bunchoid;
}


function createExecution<P>({
  key,
  wait,
  maxWait,
}: { key: any[]; wait: number; maxWait: number;}) {
  let promiseControls: { resolve: (value: any) => void; reject: (error: any) => void; };
  const promise = new Promise((resolve, reject) => {
    promiseControls = { resolve, reject };
  });

  const createdAt = Date.now();

  const execution = {
    key,
    invokeCount: 0,
    payloads: [] as P[],
    promise,
    get resolve() {
      return promiseControls.resolve;
    },
    get reject() {
      return promiseControls.reject;
    },
    createdAt,
  } as BunchoidExecution<P>;

  updateExecution(execution, { wait, maxWait });

  return execution;
}

// Helper functions

function updateExecution<P>(execution: BunchoidExecution<P>, { wait, maxWait }: { wait: number; maxWait: number; }) {
  const { createdAt } = execution;
  const now = Date.now();
  const nextScheduledAt = now + wait;
  const maxScheduledAt = createdAt + maxWait;

  execution.scheduledAt = Math.min(nextScheduledAt, maxScheduledAt);
}

// Note: the reason we have an execution path like this and don't just concat
// the key for a single hash lookup is because we want the keys to be able to
// be non-string values. This way, anything that can be a map key can be a
// bunchoid key.
function findOrCreateExecutionPath(key: any[], executions: ExecutionPath) {
  let current: ExecutionPath = executions;
  key.forEach((value) => {
    const found = current.children.get(value);
    if (found) return current = found;
    const newChild: ExecutionPath = { children: new Map(), execution: undefined, parent: current, parentKey: value };
    current.children.set(value, newChild);
    current = newChild;
  });

  return current;
}

function prunePath(
  // The node to clean up
  executionPath: ExecutionPath,
) {
  if (executionPath.children.size || executionPath.execution) return;
  const parent = executionPath.parent;
  if (!parent) return;
  parent.children.delete(executionPath.parentKey!);
  prunePath(parent);
}
