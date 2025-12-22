export type MeshMessage = {
  id: string;
  senderId: string;
  createdAt: string;
  ttl: number;
  payloadType: 'text' | 'voice' | 'location';
  payload: string;
};

const queue: MeshMessage[] = [];

export const enqueueMessage = (message: MeshMessage) => {
  queue.push(message);
};

export const getQueueSnapshot = () => {
  return [...queue];
};

export const flushQueue = () => {
  queue.length = 0;
};
