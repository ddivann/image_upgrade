import { ProcessingPipeline } from './pipeline';

const pipeline = new ProcessingPipeline();

self.onmessage = async (e: MessageEvent) => {
  const { type, taskId, payload } = e.data;

  if (type === 'start') {
    pipeline.startTask(taskId, payload);
  } else if (type === 'cancel') {
    pipeline.cancelTask(taskId);
  }
};
